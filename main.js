const Apify = require('apify');
const _ = require('underscore');
const Validator = require('jsonschema').Validator;


const DEFAULT_SAMPLE_COUNT = 1000;
const OUTPUT_KEY  = 'OUTPUT';

const parseFinishWebhookData = (json) => {
    let data;
    try {
        data = json ? JSON.parse(json) : {};
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

const getItemsSample = async (datasetId, sample) => {
    const result = {
        total: 0,
        items: [],
    };
    let limit = 1000;
    let offset = 0;
    let paginationList;
    while (result.items.length <= sample) {
        paginationList = await Apify.client.datasets.getItems({
            datasetId,
            limit,
            offset,
        });
        result.total = parseInt(paginationList.total);
        console.log(`Get items from datasetId: ${datasetId}, offset: ${paginationList.offset}`);
        result.items.push(...paginationList.items);
        if (parseInt(paginationList.count) === 0) break;
        offset = offset + limit;
    }
    return result;
};

Apify.main(async () => {
    // Get input of your act
    const input = await Apify.getValue('INPUT');
    const { actId, runId, data, _id, datasetId } = input;
    let options = input.options || {};
    let sample;
    const actOutput = {
        errors: [],
        executionAttrs: {},
    };
    const sampleCount = options.sampleCount || DEFAULT_SAMPLE_COUNT;
    let crawlerId; let executionId;

    console.log('Options:');

    if (actId && runId) {
        // Call from other act
        console.dir(options);
        const { defaultDatasetId, status } = await Apify.client.acts.getRun({ actId, runId });
        if (!defaultDatasetId) throw new Error(`No defaultDatasetId from actRun runId: ${runId}, actId: ${actId}`);

        if (status !== "SUCCEEDED") {
            actOutput.errors.push(`Run is not in SUCCEEDED status, act status: ${status}`)
        }

        sample = await getItemsSample(defaultDatasetId, sampleCount);
    } else if (_id && actId) {
        // Call from crawler
        if (data) options = parseFinishWebhookData(data) || {};
        console.dir(options);

        executionId = _id;
        crawlerId = actId;
        const execution = await Apify.client.crawlers.getExecutionDetails({ executionId });
        if (!execution) throw new Error('execution-not-exists');

        console.log('Execution:');
        console.dir(execution);

        // Check Crawler status
        if (execution.status !== "SUCCEEDED") {
            actOutput.errors.push(`Execution is not in SUCCEEDED status, crawler status: ${execution.status}`)
        }

        sample = await getExecutionResultsSample(executionId, sampleCount);
    } else if (datasetId) {
        // Call just with datasetId
        console.dir(options);
        sample = await getItemsSample(datasetId, sampleCount);
    }

    // Validate results count
    if (options.minOutputtedPages && sample.total < options.minOutputtedPages) {
        actOutput.errors.push(`Crawler returns only ${sample.total} outputted pages and minumum is ${options.minOutputtedPages}`);
    }

    // Validate each result from sample
    const validator = new Validator();
    const existingAttrs = {};
    sample.items.forEach((item, index) => {
        const lineKey = item.url ? item.url : `Line: ${index}`;
        if (item.errorInfo || item.errors || item.error) {
            actOutput.errors.push(`${lineKey}: Crawler doesn't load page errorInfo: ${item.errorInfo || item.errors || item.error}`);
        }

        // validate results again json schema
        if (options.jsonSchema) {
            const validation = validator.validate(item, options.jsonSchema);
            if (!validation.valid) {
                actOutput.errors.push(`${lineKey}: json schema validate errors: ${validation.errors.join(',')}`);
            }
        }

        // Save result attributes
        Object.keys(item).forEach(key => {
            if(item[key]) existingAttrs[key] = typeof item[key]
        });
    });
    actOutput.executionAttrs = Object.keys(existingAttrs);

    // Compare with previous check only for crawler
    if (options.compareWithPreviousExecution && crawlerId) {
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
        if (options.notifyTo) {
            const email = {
                to: options.notifyTo,
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
        if (options.runActOnError && options.runActOnError.id) {
            const actInput = (options.runActOnError.input) ? options.runActOnError.input : Object.assign({}, input, actOutput);
            await Apify.call(options.runActOnError.id, actInput);
        }
    } else {
        if (options.runActOnSuccess && options.runActOnSuccess.id) {
            const actInput = (options.runActOnSuccess.input) ? options.runActOnSuccess.input : Object.assign({}, input, actOutput);
            await Apify.call(options.runActOnSuccess.id, actInput);
        }
    }
    console.log('Act finished');
});
