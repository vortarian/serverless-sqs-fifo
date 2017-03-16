'use strict';

const BbPromise = require('bluebird');
const validate = require('serverless/lib/plugins/aws/lib/validate');
const queues = require('./lib/queues');

class SqsFifo {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options || {};
    this.provider = this.serverless.getProvider('aws');

    Object.assign(
      this,
      validate,
      queues
    );

    this.queueStack = [];
    if(this.serverless.service.custom &&
        this.serverless.service.custom.sqs &&
        this.serverless.service.custom.sqs.queues
      ) {
          let queuesConfig = this.serverless.service.custom.sqs.queues
          for (var i in queuesConfig) {
            queuesConfig[i]["logical_name"] = `custom.sqs.queues.${i}`
            this.queueStack[this.queueStack.length] = queuesConfig[i];
          }
    }

    this.hooks = {
      'before:deploy:initialize': () => 
        BbPromise.bind(this)
        .then(this.validate)
        .then(this.create)
        .then(this.decorate),
      'after:remove:remove': () => 
        BbPromise.bind(this)
        .then(this.validate)
        .then(this.remove),
    };

  }
}

module.exports = SqsFifo;
