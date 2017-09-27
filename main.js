const Apify = require('apify');
const request = require('request-promise');
const mailgun = require('mailgun-js');
const _ = require('underscore');

const DEFAULT_SAMPLE = 1000;

const parseFinishWebhookData = (input) => {
    let data;
    try {
        data = input.data ? JSON.parse(input.data) : {};
    } catch (e) {
        console.log(`Cannot parse finishWebhookData as JSON ${input.data}`);
    }
    return data;
};

/**
 * Gets results from execution pagination lists
 * TODO: Choose better sample, now we take first x results
 */
const getExecutionResultsSample = async (executionId, sample) => {
    const result = {
        total: 0,
        items: [],
    };
    let limit = 1000;
    let offset = 0;
    let paginationList;
    while (result.items.length <= sample) {
        paginationList = await Apify.client.crawlers.getExecutionResults({
            executionId,
            limit,
            offset,
            simplified: 1
        });
        result.total = parseInt(paginationList.total);
        for (let pageFunctionResult of paginationList.items) {
            if (_.isArray(pageFunctionResult)) {
                for (let item of pageFunctionResult) result.items.push(item);
            } else {
                result.items.push(pageFunctionResult);
            }

        }
        if (parseInt(paginationList.count) === 0) break;
        offset += limit;
    }
    return result;
};

Apify.main(async () => {
    // Get input of your act
    const input = await Apify.getValue('INPUT');
    const finishWebhookData = parseFinishWebhookData(input);
    //if (checkFinishWebhookData(finishWebhookData)) throw new Error('invalid-input-data');

    console.log('Finish webhook data:');
    console.dir(finishWebhookData);

    const executionId = input._id;
    const execution = await Apify.client.crawlers.getExecutionDetails({ executionId });
    if (!execution) throw new Error('execution-not-exists');
    console.log('Execution:');
    console.dir(execution);

    const errors = [];
    const sample = finishWebhookData.sample || DEFAULT_SAMPLE;

    // Crawler status
    if (execution.status !== "SUCCEEDED") {
        errors.push(`Execution is not in SUCCEEDED status, crawler status: ${execution.status}`)
    }

    const executionResultsSample = await getExecutionResultsSample(executionId, sample);
    // Validate each result
    executionResultsSample.items.forEach((result) => {
        if (result.errorInfo) {
            errors.push(`${result.url}: Crawler doesn't load page errorInfo: ${result.errorInfo}`);
        }
    });
    // Validate results cout
    if (finishWebhookData.minResults && executionResultsSample.total < finishWebhookData.minResults) {
        errors.push(`Crawler returns only ${executionResultsSample.total} and minumum is ${finishWebhookData.minResults}`);
    }

    console.log('Errors found:');
    errors.forEach(error => console.log(error));
    // Save errors to output
    await Apify.setValue('OUTPUT', errors);
    // Send mail with errors
    if (errors.length && finishWebhookData.notifyTo) {
        const email = {
            to: finishWebhookData.notifyTo,
            subject: `Apify notification: ${errors.length} errors in crawler execution id ${executionId}`,
            text: `Hi there,\n` +
            `\n` +
            `This is automatic notification from Apify crawlers.\n` +
            `We found ${errors.length} errors in crawler execution id ${executionId}.\n` +
            `\n` +
            `Execution detail: https://api.apifier.com/v1/execs/${executionId}\n` +
            `Execution results: https://api.apifier.com/v1/execs/${executionId}/results\n` +
            `\n` +
            `Errors log:\n` +
            errors.join('\n') +
            `\n` +
            `Happy Crawling`,
        };
        await Apify.call({
            actId: 'apify/send-mail',
            input: {
                contentType: 'application/json',
                body: JSON.stringify(email),
            }
        });
    }
});