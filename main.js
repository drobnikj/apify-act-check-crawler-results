const Apify = require('apify');
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
    const crawlerId = input.actId;
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
    if (finishWebhookData.compareWithPreviousExecution) {
        const executions = await Apify.client.crawlers.getListOfExecutions({ crawlerId, desc: 1 });
        let previousExecution;
        let currentAcExecution;
        for (let exec of executions.items) {
            if (exec._id === executionId) currentAcExecution = exec;
            if (currentAcExecution && currentAcExecution.tag === exec.tag && (new Date(exec.startedAt) < new Date(currentAcExecution.startedAt))) {
                previousExecution = exec;
                break;
            }
        }
        if (previousExecution) {
            const previousExecutionResults = await getExecutionResultsSample(previousExecution._id, sampleCount);
            let previousExecutionAtts = {};
            previousExecutionResults.items.forEach((item) => {
                // Save result attributes
                Object.keys(item).forEach(key => {
                    if(item[key]) previousExecutionAtts[key] = typeof item[key]
                });
            });
            previousExecutionAtts = Object.keys(previousExecutionAtts);
            const attributesDiff = previousExecutionAtts.filter((i) => actOutput.executionAttrs.indexOf(i) < 0);
            if (attributesDiff.length) {
                actOutput.errors.push(`Crawler doesn't have all attributes as previous run, missing ${attributesDiff.length} attributes: ${attributesDiff.join(',')}`);
            }
        } else {
            actOutput.errors.push(`Previous execution with tag ${execution.tag} not found.`);
        }
    }

    console.log('Errors found:');
    actOutput.errors.forEach(error => console.log(error));
    // Save errors to output
    await Apify.setValue(OUTPUT_KEY, actOutput);
    // Send mail with errors
    if (actOutput.errors.length) {
        if (finishWebhookData.notifyTo) {
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
            await Apify.call('apify/send-mail', email);
        }
        if (finishWebhookData.runActOnError && finishWebhookData.runActOnError.id) {
            const actInput = (finishWebhookData.runActOnError.input) ? finishWebhookData.runActOnError.input : Object.assign({}, input, actOutput);
            await Apify.call(finishWebhookData.runActOnError.id, actInput);
        }
    } else {
        if (finishWebhookData.runActOnSuccess && finishWebhookData.runActOnSuccess.id) {
            const actInput = (finishWebhookData.runActOnSuccess.input) ? finishWebhookData.runActOnSuccess.input : Object.assign({}, input, actOutput);
            await Apify.call(finishWebhookData.runActOnSuccess.id, actInput);
        }
    }
    console.log('Act finished');
});
