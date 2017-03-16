'use strict';

const aws = require('aws-sdk');
const BbPromise = require('bluebird');
const traverse = require('traverse');

aws.config.setPromisesDependency(BbPromise);

let sqs;

function searchAndReplace(target, queues) {
  traverse(target).forEach(function(x) {
    let queue;
    for(var q in queues) {
      switch(x) {
      case `${queues[q].logical_name}.arn`:
        this.update(queues[q].arn);
        break;
      case `${queues[q].logical_name}.url`:
        this.update(queues[q].url);
        break;
      default:
        break;
      }
    }
  });
}

module.exports = {
  create() {
    let _this = this;
    if(!sqs) 
      sqs = new aws.SQS({
        'apiVersion': '2012-11-05',
        'region': _this.options.region
      });

    if (!_this.queueStack.length) {
      return Promise.resolve();
    }

    let queue = _this.queueStack.shift();
    let params = {
      'QueueName': queue.QueueName,
      'Attributes': {}
    };
    for( var p in queue.Properties) {
      if ('RedrivePolicy' === p) {
        params.Attributes[p] = JSON.stringify(queue.Properties[p]);
      } else {
        params.Attributes[p] = queue.Properties[p].toString();
      }
    };

    return sqs.createQueue(params).promise()
      .catch((err) => {
        _this.serverless.cli.log(`Error in creating queue: ${JSON.stringify(err, null, 2)}`);
        throw err;
      })
      .then((data) => {
        queue.url = data.QueueUrl;
        // Get the arn
        return sqs.getQueueAttributes({
          'AttributeNames': ["QueueArn"],
          'QueueUrl': queue.url
        }).promise()
      })
      .catch((err) => {
        _this.serverless.cli.log(`Error in obtaining queue Arn: ${JSON.stringify(err, null, 2)}`);
        throw err;
      })
      .then((q) => {
        queue.arn = q.Attributes.QueueArn;
        // Iterate the rest of the queue's and replace the arn reference if the other queues have dead letter queues
        for(var iq in _this.queueStack) {
          let nq = _this.queueStack[iq];
          if ('RedrivePolicy' in nq.Properties) {
            if (nq.Properties.RedrivePolicy.deadLetterTargetArn === queue.logical_name)
              nq.Properties.RedrivePolicy.deadLetterTargetArn = queue.arn;
          }
        };
        _this.serverless.cli.log(`severless-sqs-queue Created queue ${queue.url} for ${queue.logical_name}`);
        // Are we on the last queue?
        if (_this.queueStack.length !== 0) {
          // Do this for the other items in the queue
          return _this.create();
        } else {
          // We're Done!
        }
      });
  },
  decorate(val) {
    // If we break serverless, this is probably the place we did it
    searchAndReplace(this.serverless.service, this.serverless.service.custom.sqs.queues);
  },
  remove() {
console.log("sqs-fifo.remove()");
    let _this = this;
    if(!sqs) 
      sqs = new aws.SQS({
        'apiVersion': '2012-11-05',
        'region': _this.options.region
      });

    if (!_this.queueStack.length) {
      return Promise.resolve();
    }

    let queue = _this.queueStack.shift();
    let params = {
      'QueueNamePrefix': queue.QueueName,
    };

    // Here's some crazyiness ... you need the url or arn to delete the queue, you get them by calling createQueue ...
    return sqs.listQueues(params).promise()
      .catch((err) => {
        _this.serverless.cli.log(`Error in creating queue: ${JSON.stringify(err, null, 2)}`);
        throw err;
      })
      .then((data) => {
console.log(`sqsRemoving queue ${JSON.stringify(data.QueueUrls, null, 2)}`);
        // Delete the queue
        for(var qu in data.QueueUrls) {
          if(data.QueueUrls[qu].toString().endsWith(`/${queue.QueueName}`)) {
            return sqs.deleteQueue({
              'QueueUrl': data.QueueUrls[qu].toString()
            }).promise()
              .catch((err) => {
                _this.serverless.cli.log(`Error in removing queue: ${JSON.stringify(err, null, 2)}`);
                throw err;
              })
              .then(() => {
                _this.remove();
              })
          }
        }
      })
      .catch((err) => {
        _this.serverless.cli.log(`Error in listing queues arn: ${JSON.stringify(err, null, 2)}`);
        throw err;
      });
  },
};