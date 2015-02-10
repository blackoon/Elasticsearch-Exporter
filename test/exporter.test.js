var expect = require('chai').expect;
var gently = new (require('gently'))();
var mockDriver = require('./driver.mock.js');
var exporter = require('../exporter.js');
var options = require('../options.js');
var drivers = require('../drivers.js');
var log = require('../log.js');

log.capture = true;

describe("exporter", function() {
    describe("#handleUncaughtExceptions()", function() {
        beforeEach(function () {
            log.pollCapturedLogs();
        });

        it("should print the exception if one is passed in", function() {
            try {
                exporter.handleUncaughtExceptions(new Error("Test Error"));
            } catch (e) {}
            var logs = log.pollCapturedLogs();
            expect(logs[0]).to.contain('Test Error');
        });

        it("should print the message if one is passed in", function () {
            try {
                exporter.handleUncaughtExceptions("Test Message");
            } catch (e) {}
            var logs1 = log.pollCapturedLogs();
            expect(logs1[0]).to.contain('Test Message');
        });

        it("should print a generic message if nothing is passed in", function () {
            try {
                exporter.handleUncaughtExceptions("Test Message");
            } catch (e) {}
            var logs1 = log.pollCapturedLogs();
            expect(logs1[0]).to.not.be.empty();
        });
    });

    describe('#getMemoryStats()', function () {
        it("should have a memory ratio between 0 and 1", function (done) {
            exporter.env = {
                statistics: {
                    memory: {}
                }
            };
            var ratio = exporter.getMemoryStats();
            expect(ratio).to.be.within(0, 1);
            done();
        });

        it("should cache memory requests for a time", function (done) {
            exporter.env = {
                statistics: {
                    memory: {}
                }
            };
            var ratio1 = exporter.getMemoryStats();
            var ratio2 = exporter.getMemoryStats();
            expect(ratio1).to.be.equal(ratio2);
            setTimeout(function () {
                var ratio3 = exporter.getMemoryStats();
                expect(ratio1).not.to.be.equal(ratio3);
                done();
            }, 1000);
        });
    });

    describe("#waitOnTargetDriver()", function() {
        afterEach(function () {
            gently.verify();
        });

        it("should not be trying to do a gc and just keep going", function (done) {
            gently.expect(exporter, 'getMemoryStats', function () {
                return 0.5;
            });

            global.gc = true;
            exporter.env = {
                options: {
                    memory: {
                        limit: 0.8
                    }
                }
            };
            exporter.waitOnTargetDriver(done);
        });

        it("should try gc once and then continue", function (done) {
            gently.expect(exporter, 'getMemoryStats', function () {
                return 0.9;
            });
            gently.expect(global, 'gc');
            exporter.env = {
                options: {
                    memory: {
                        limit: 0.8
                    }
                }
            };
            exporter.waitOnTargetDriver(done);
        });

        it("should not do anything other than call the callback", function (done) {
            global.gc = false;
            exporter.env = {
                options: {
                    memory: {
                        limit: 0.9
                    }
                }
            };
            exporter.waitOnTargetDriver(done);
        });
    });

    describe("#storeData()", function () {
        afterEach(function () {
            gently.verify();
            exporter.queue = [];
        });

        it("should queue all hits", function () {
            var hits = [{
                _id: '1',
                _index: 'mock',
                _type: 'test',
                _source: {
                    some: 'thing'
                }
            }, {
                _id: '2',
                _index: 'mock',
                _type: 'test',
                _source: {
                    other: 'thing'
                }
            }];

            exporter.status = 'ready';
            exporter.storeData(hits);

            expect(exporter.queue).to.be.deep.equal(hits);
        });

        it("should send all hits to the driver", function () {
            exporter.env = {
                options: {
                    log: {
                        count: false
                    },
                    errors: {
                        retry: 0,
                        ignore: 0
                    },
                    drivers: {
                        target: 'mock'
                    }
                },
                statistics: {
                    docs: {
                        processed: 0,
                        total: 0
                    }
                }
            };

            var hits = [{
                _id: '1',
                _index: 'mock',
                _type: 'test',
                _source: {
                    some: 'thing'
                }
            },{
                _id: '2',
                _index: 'mock',
                _type: 'test',
                _source: {
                    other: 'thing'
                }
            }];
            var mock = mockDriver.getDriver();

            gently.expect(drivers, 'get', function(id) {
                expect(id).to.be.equal('mock');
                return {
                    info: mock.getInfoSync(),
                    options: mock.getOptionsSync(),
                    driver: mock
                };
            });

            gently.expect(mock, 'putData', function(env, driverHits){
                expect(driverHits).to.be.deep.equal(hits);
            });

            exporter.status = 'running';
            exporter.storeData(hits);
        });

        it("should send both queued and new hits to the driver", function() {
            exporter.env = {
                options: {
                    log: {
                        count: false
                    },
                    errors: {
                        retry: 0,
                        ignore: 0
                    },
                    drivers: {
                        target: 'mock'
                    }
                },
                statistics: {
                    docs: {
                        processed: 0,
                        total: 3
                    }
                }
            };

            var hits = [{
                _id: '1',
                _index: 'mock',
                _type: 'test',
                _source: {
                    some: 'thing'
                }
            }, {
                _id: '2',
                _index: 'mock',
                _type: 'test',
                _source: {
                    other: 'thing'
                }
            }];
            var mock = mockDriver.getDriver();

            gently.expect(drivers, 'get', function (id) {
                expect(id).to.be.equal('mock');
                return {
                    info: mock.getInfoSync(),
                    options: mock.getOptionsSync(),
                    driver: mock
                };
            });

            gently.expect(mock, 'putData', function (env, driverHits, callback) {
                expect(driverHits).to.be.deep.equal([{
                    _id: '1',
                    _index: 'mock',
                    _type: 'test',
                    _source: {
                        some: 'thing'
                    }
                }, {
                    _id: '2',
                    _index: 'mock',
                    _type: 'test',
                    _source: {
                        other: 'thing'
                    }
                }, {
                    _id: '3',
                    _index: 'mock',
                    _type: 'test',
                    _source: {
                        another: 'thing'
                    }
                }]);
                callback();
            });

            exporter.status = 'running';
            exporter.queue = [{
                _id: '3',
                _index: 'mock',
                _type: 'test',
                _source: {
                    another: 'thing'
                }
            }];
            exporter.storeData(hits);
            expect(exporter.status).to.be.equal('done');
            expect(exporter.env.statistics.docs.processed).to.be.equal(3);
        });

        it("should retry a call when it returned an error the first time", function() {
            exporter.env = {
                options: {
                    log: {
                        count: false
                    },
                    errors: {
                        retry: 2,
                        ignore: 0
                    },
                    drivers: {
                        target: 'mock'
                    }
                },
                statistics: {
                    docs: {
                        processed: 0,
                        total: 3
                    }
                }
            };

            var hits = [{},{}];
            var mock = mockDriver.getDriver();

            gently.expect(drivers, 'get', function (id) {
                expect(id).to.be.equal('mock');
                return {
                    info: mock.getInfoSync(),
                    options: mock.getOptionsSync(),
                    driver: mock
                };
            });

            gently.expect(mock, 'putData', 2, function (env, driverHits, callback) {
                expect(driverHits).to.be.deep.equal(hits);
                callback("error");
            });

            exporter.status = 'running';
            exporter.storeData(hits);
        });

        it("should continue even if the number of retries have been reached (option errors.ignore = true)", function(){
            exporter.env = {
                options: {
                    log: {
                        count: false
                    },
                    errors: {
                        retry: 2,
                        ignore: true
                    },
                    drivers: {
                        target: 'mock'
                    }
                },
                statistics: {
                    docs: {
                        processed: 0,
                        total: 3
                    }
                }
            };

            var hits = [{}, {}];
            var mock = mockDriver.getDriver();

            gently.expect(drivers, 'get', function (id) {
                expect(id).to.be.equal('mock');
                return {
                    info: mock.getInfoSync(),
                    options: mock.getOptionsSync(),
                    driver: mock
                };
            });

            gently.expect(mock, 'putData', 2, function (env, driverHits, callback) {
                expect(driverHits).to.be.deep.equal(hits);
                callback("error");
            });

            exporter.status = 'running';
            exporter.storeData(hits);

            var otherHits = [{}, {}, {}];

            gently.expect(drivers, 'get', function (id) {
                expect(id).to.be.equal('mock');
                return {
                    info: mock.getInfoSync(),
                    options: mock.getOptionsSync(),
                    driver: mock
                };
            });

            gently.expect(mock, 'putData', function (env, driverHits, callback) {
                expect(driverHits).to.be.deep.equal(otherHits);
                callback("error");
            });
            exporter.storeData(otherHits);
        });

        it("should terminate if the number of retries have been reached (option errors.ignore = false)", function () {
            exporter.env = {
                options: {
                    log: {
                        count: false
                    },
                    errors: {
                        retry: 2,
                        ignore: false
                    },
                    drivers: {
                        target: 'mock'
                    }
                },
                statistics: {
                    docs: {
                        processed: 0,
                        total: 3
                    }
                }
            };

            var hits = [{}, {}];
            var mock = mockDriver.getDriver();

            gently.expect(drivers, 'get', function (id) {
                expect(id).to.be.equal('mock');
                return {
                    info: mock.getInfoSync(),
                    options: mock.getOptionsSync(),
                    driver: mock
                };
            });

            gently.expect(mock, 'putData', 2, function (env, driverHits, callback) {
                expect(driverHits).to.be.deep.equal(hits);
                callback("error");
            });

            exporter.status = 'running';
            exporter.storeData(hits);
            exporter.status = "done";
        });
    });

    describe("main{}", function() {
        function setUpMockDriver() {
            exporter.env = {
                options: {
                    drivers: {
                        target: 'mock',
                        source: 'mock'
                    },
                    errors: {
                        retry: 1
                    }
                },
                statistics: {
                    source: {},
                    target: {}
                }
            };
            var mock = mockDriver.getDriver();
            gently.expect(drivers, 'get', function (id) {
                expect(id).to.be.equal('mock');
                return {
                    info: mock.getInfoSync(),
                    options: mock.getOptionsSync(),
                    driver: mock
                };
            });
            return mock;
        }

        describe("#read_options()", function() {
            afterEach(function () {
                gently.verify();
            });

            it("should call the callback when an option tree has been returned", function(done) {
                gently.expect(options, 'read', function (callback) {
                    callback({
                        option: 'test'
                    });
                });
                exporter.main.read_options(function (err, options) {
                    expect(err).to.be.null();
                    expect(options).to.be.deep.equal({
                        option: 'test'
                    });
                    done();
                });
            });

            it("should throw an error if nothing is returned", function(done) {
                gently.expect(options, 'read', function (callback) {
                    callback();
                });
                exporter.main.read_options(function (err) {
                    expect(err).to.not.be.null();
                    done();
                });
            });
        });

        describe("#verify_options()", function () {
            afterEach(function () {
                gently.verify();
            });

            it("should call the callback when a verification has completed successfully", function (done) {
                gently.expect(options, 'verify', function (options, callback) {
                    expect(options).to.be.deep.equal({
                        options: 'test'
                    });
                    callback();
                });
                exporter.main.verify_options(function (err) {
                    expect(err).to.not.be.ok();
                    done();
                }, {
                    read_options: {
                        options: 'test'
                    }
                });
            });

            it("should throw an error if the verification has not worked as expected", function (done) {
                gently.expect(options, 'verify', function (options, callback) {
                    expect(options).to.be.deep.equal({
                        options: 'test'
                    });
                    callback(['There has been an error']);
                });
                exporter.main.verify_options(function (err) {
                    expect(err).to.be.ok();
                    done();
                }, {
                    read_options: {
                        options: 'test'
                    }
                });
            });
        });

        describe("#reset_source()", function () {
            afterEach(function () {
                gently.verify();
            });

            it("should call the reset function of the source driver", function(done) {
                var mock = setUpMockDriver();
                gently.expect(mock, 'reset', function (env, callback) {
                    expect(env).to.be.deep.equal(exporter.env);
                    callback();
                });
                exporter.main.reset_source(function(err) {
                    expect(err).to.not.be.ok();
                    done();
                });
            });
        });

        describe("#reset_target()", function () {
            afterEach(function () {
                gently.verify();
            });

            it("should call the reset function of the target driver", function (done) {
                var mock = setUpMockDriver();
                gently.expect(mock, 'reset', function (env, callback) {
                    expect(env).to.be.deep.equal(exporter.env);
                    callback();
                });
                exporter.main.reset_target(function () {
                    done();
                });
            });
        });

        describe("#get_source_statistics()", function () {
            afterEach(function () {
                gently.verify();
            });

            it("should call the getSourceStats function of the source driver", function (done) {
                var mock = setUpMockDriver();
                gently.expect(mock, 'getSourceStats', function (env, callback) {
                    expect(env).to.be.deep.equal(exporter.env, callback);
                    callback(null, {
                        sourceStat: 0
                    });
                });
                exporter.main.get_source_statistics(function (err) {
                    expect(err).to.not.be.ok();
                    expect(exporter.env.statistics.source).to.be.deep.equal({
                        sourceStat: 0
                    });
                    done();
                });
            });

            it("should continue without errors if the source driver returns nothing", function (done) {
                var mock = setUpMockDriver();
                gently.expect(mock, 'getSourceStats', function (env, callback) {
                    expect(env).to.be.deep.equal(exporter.env, callback);
                    callback();
                });
                exporter.main.get_source_statistics(function (err) {
                    expect(err).to.not.be.ok();
                    expect(exporter.env.statistics.source).to.be.deep.equal({});
                    done();
                });
            });
        });

        describe("#get_target_statistics()", function () {
            afterEach(function () {
                gently.verify();
            });

            it("should call the getSourceStats function of the source driver", function (done) {
                var mock = setUpMockDriver();
                gently.expect(mock, 'getTargetStats', function (env, callback) {
                    expect(env).to.be.deep.equal(exporter.env, callback);
                    callback(null, {
                        targetStat: 0
                    });
                });
                exporter.main.get_target_statistics(function (err) {
                    expect(err).to.not.be.ok();
                    expect(exporter.env.statistics.target).to.be.deep.equal({
                        targetStat: 0
                    });
                    done();
                });
            });

            it("should continue without errors if the source driver returns nothing", function (done) {
                var mock = setUpMockDriver();
                gently.expect(mock, 'getTargetStats', function (env, callback) {
                    expect(env).to.be.deep.equal(exporter.env, callback);
                    callback();
                });
                exporter.main.get_target_statistics(function (err) {
                    expect(err).to.not.be.ok();
                    expect(exporter.env.statistics.target).to.be.deep.equal({});
                    done();
                });
            });
        });

        describe("#check_source_health()", function () {
            afterEach(function () {
                gently.verify();
            });

            it("should check if the source is connected and docs are available", function(done) {
                exporter.env = {
                    statistics: {
                        source: {
                            status: 'green',
                            docs: {
                                total: 1
                            }
                        }
                    }
                };
                exporter.main.check_source_health(function(err) {
                    expect(err).to.be.not.ok();
                   done();
                });
            });

            it("should throw an error if no docs can be exported", function (done) {
                exporter.env = {
                    statistics: {
                        source: {
                            status: 'green',
                            docs: {
                                total: 0
                            }
                        }
                    }
                };
                exporter.main.check_source_health(function (err) {
                    expect(err.length).to.be.at.least(1);
                    done();
                });
            });

            it("should throw an error if source is not ready", function (done) {
                exporter.env = {
                    statistics: {
                        source: {
                            status: 'red'
                        }
                    }
                };
                exporter.main.check_source_health(function (err) {
                    expect(err.length).to.be.at.least(1);
                    done();
                });
            });
        });

        describe("#check_target_health()", function () {
            afterEach(function () {
                gently.verify();
            });

            it("should check if the source is ready", function (done) {
                exporter.env = {
                    statistics: {
                        target: {
                            status: 'green'
                        }
                    }
                };
                exporter.main.check_target_health(function (err) {
                    expect(err).to.be.not.ok();
                    done();
                });
            });

            it("should throw an error if target is not ready", function (done) {
                exporter.env = {
                    statistics: {
                        target: {
                            status: 'red'
                        }
                    }
                };
                exporter.main.check_target_health(function (err) {
                    expect(err.length).to.be.at.least(1);
                    done();
                });
            });
        });

        describe("#get_metadata()", function () {
            afterEach(function () {
                gently.verify();
            });

            it("should call the source driver getMeta function", function(done) {
                var mock = setUpMockDriver();
                gently.expect(mock, 'getMeta', function (env, callback) {
                    expect(env).to.be.deep.equal(exporter.env);
                    callback(null, {
                        source: 'metadata'
                    });
                });
                exporter.main.get_metadata(function (err, metadata) {
                    expect(err).to.not.be.ok();
                    expect(metadata).to.be.deep.equal({
                        source: 'metadata'
                    });
                    done();
                });
            });

            it("should use the mapping from the options instead of calling the source driver", function(done) {
                exporter.env = {
                    options: {
                        errors: {
                            retry: 0
                        },
                        mapping: {
                            test: 'mapping'
                        }
                    }
                };

                exporter.main.get_metadata(function(err, metadata) {
                    expect(err).to.be.not.ok();
                    expect(metadata).to.be.deep.equal({
                        test: 'mapping'
                    });
                    done();
                });
            });

            it("should pass on an error if the source returns an error", function(done) {
                var mock = setUpMockDriver();
                gently.expect(mock, 'getMeta', function (env, callback) {
                    expect(env).to.be.deep.equal(exporter.env);
                    callback("Error");
                });
                exporter.main.get_metadata(function (err) {
                    expect(err).to.be.equal("Error");
                    done();
                });
            });
        });

        describe("#store_metadata()", function () {
            afterEach(function () {
                gently.verify();
            });
        });

        describe("#get_data()", function () {
            afterEach(function () {
                gently.verify();
            });

        });

        describe("#start_export()", function () {
            afterEach(function () {
                gently.verify();
            });

        });

        describe("#run()", function () {
            afterEach(function () {
                gently.verify();
            });
        });
    });
});