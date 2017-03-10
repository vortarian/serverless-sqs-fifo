'use strict';

const aws = require('aws-sdk');
const BbPromise = require('bluebird');
aws.config.setPromisesDependency(BbPromise);

module.exports = {
  create() {
    let _this = this;
    if(_this.queueStack.length === 0) return;
    let queue = _this.queueStack.shift();
      let sqs = new aws.SQS({
        'apiVersion': '2012-11-05',
        'region': _this.options.region
      });
      let params = {
        'QueueName': queue.QueueName,
        'Attributes': {}
      }
      for (var p in queue.Properties) {
        if ("RedrivePolicy" === p) {
          params.Attributes[p] = JSON.stringify(queue.Properties[p]);
        } else {
          params.Attributes[p] = queue.Properties[p].toString();
        }
      }
      return sqs.createQueue(params).promise().then((data) => {
          queue.url = data.QueueUrl;
          // Get the arn
          return sqs.getQueueAttributes({
              'AttributeNames': ["QueueArn"],
              'QueueUrl': queue.url
            }).promise().catch((err) => {
              _this.serverless.cli.log(`Error in serverless-sqs-fifo fetching queue attributes for ${queue.url}: ${err}`);
              throw err;
            }).then((q) => {
              queue.arn = q.Attributes.QueueArn;
              // Iterate the rest of the queue's and replace the arn reference if present for dead letter queues
              for (var iq in _this.queueStack) {
                let nq = _this.queueStack[iq];
                if ("RedrivePolicy" in nq.Properties) {
                  if (nq.Properties.RedrivePolicy.deadLetterTargetArn === queue.logical_name)
                    nq.Properties.RedrivePolicy.deadLetterTargetArn = queue.arn;
                }
              }
              // Recurse into create method, it will return when the stack is empty
              return _this.queueStack.length;
            }).catch((err) => {
              _this.serverless.cli.log(`Error in serverless-sqs-fifo replacing queue arn for ${queue.arn}: ${err}`);
              throw err;
            }).then((count) => {
              if (count === 0) {
                let queues = _this.serverless.service.custom.sqs.queues;
                for (var i in queues)
                  _this.serverless.cli.log(JSON.stringify(queues[i], null, 2));
              } else {
                return _this.create();
              }
            });
        });
  },
  decorate(val) {
    // Trigger serverless to evaluate variables again to pick up the new data we added
    // If we break serverless, this is probably the place we did it
    console.log("Calling populateService again");
    this.serverless.variables.populateService(this.serverless.pluginManager.cliOptions);
  },
  update(data) {
    console.log(`Calling update ${JSON.stringify(data, null, 2)}`);
    this.serverless.update(data);
  },
  remove() {
    this.serverless.cli.log(`Stub queues remove`);
    queues = this.serverless.service.custom.sqs.fifo.queues;
    for (var i in queues)
      console.log("Stub queue removing " + queues[i].arn);
  }
};