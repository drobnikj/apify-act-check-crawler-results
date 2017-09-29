const Apify = require('apify');
const request = require('request-promise');
const mailgun = require('mailgun-js');
const _ = require('underscore');
const Validator = require('jsonschema').Validator;


const DEFAULT_SAMPLE_COUNT = 1000;
const OUTPUT_KEY  = 'OUTPUT';

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

    const actOutput = {
        errors: [],
        executionAttrs: {},
    };
    const sampleCount = finishWebhookData.sampleCount || DEFAULT_SAMPLE_COUNT;

    // Check Crawler status
    if (execution.status !== "SUCCEEDED") {
        actOutput.errors.push(`Execution is not in SUCCEEDED status, crawler status: ${execution.status}`)
    }

    const executionResultsSample = await getExecutionResultsSample(executionId, sampleCount);

    // Validate results count
    if (finishWebhookData.minOutputtedPages && executionResultsSample.total < finishWebhookData.minOutputtedPages) {
        actOutput.errors.push(`Crawler returns only ${executionResultsSample.total} outputted pages and minumum is ${finishWebhookData.minOutputtedPages}`);
    }

    // Validate each result from sample
    const validator = new Validator();
    const existingAttrs = {};
    executionResultsSample.items.forEach((item) => {
        if (item.errorInfo) {
            actOutput.errors.push(`${item.url}: Crawler doesn't load page errorInfo: ${item.errorInfo}`);
        }

        // validate results again json schema
        if (finishWebhookData.jsonSchema) {
            const validation = validator.validate(item, finishWebhookData.jsonSchema);
            if (!validation.valid) {
                actOutput.errors.push(`${item.url}: json schema validate errors: ${validation.errors.join(',')}`);
            }
        }

        // Save result attributes
        Object.keys(item).forEach(key => {
            if(item[key]) existingAttrs[key] = typeof item[key]
        });
    });
    actOutput.executionAttrs = Object.keys(existingAttrs);

    // Compare with previous check
    if (finishWebhookData.compareWithPrevious) {
        const actId = Apify.getEnv().actId;
        const actRunId = Apify.getEnv().actRunId;
        const actRuns = await Apify.client.acts.listRuns({ actId, desc: 1});
        let previousRun;
        let currentAcRun;
        for (let actRun of actRuns.items) {
            if (act.id === actRunId) currentAcRun = actRun;
            if (currentAcRun && actRun.status === 'SUCCEEDED' && (new Date(actRun.startedAt) < new Date(actRun.startedAt))) {
                previousRun = await Apify.client.acts.getRun({ actId, runId: actRun.id })
            }
        }
        const previousRunOutput = await Apify.client.keyValueStores.getRecord({ storeId: previousRun.defaultKeyValueStoreId, key: OUTPUT_KEY });
        const attributesDiff = previousRunOutput.executionAttrs.filter((i) => actOutput.executionAttrs.indexOf(i) < 0);
        if (attributesDiff) {
            actOutput.errors.push(`Crawler doesn't have all attributes as previous run, missing: ${attributesDiff.join(',')}`);
        }
    }

    console.log('Errors found:');
    actOutput.errors.forEach(error => console.log(error));
    // Save errors to output
    await Apify.setValue(OUTPUT_KEY, actOutput);
    // Send mail with errors
    if (actOutput.errors.length && finishWebhookData.notifyTo) {
        const email = {
            to: finishWebhookData.notifyTo,
            subject: `Apify notification: ${actOutput.errors.length} errors in crawler execution id ${executionId}`,
            text: `Hi there,\n` +
            `\n` +
            `This is automatic notification from Apify crawlers.\n` +
            `We found ${actOutput.errors.length} errors in crawler execution id ${executionId}.\n` +
            `\n` +
            `Execution detail: https://api.apifier.com/v1/execs/${executionId}\n` +
            `Execution results: https://api.apifier.com/v1/execs/${executionId}/results\n` +
            `\n` +
            `Errors log:\n` +
            actOutput.errors.join('\n') +
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
    console.log('Act finished');
});