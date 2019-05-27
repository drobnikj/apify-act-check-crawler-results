const crawlerExecutionEmail = (actOutput, executionId) => {
    return {
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
    }
};


const datasetEmail = (actOutput, datasetId) => {
    return {
        subject: `Apify notification: ${actOutput.errors.length} errors in dataset id ${datasetId}`,
        text: `Hi there,\n` +
            `\n` +
            `This is automatic notification from Apify Datasets.\n` +
            `We found ${actOutput.errors.length} errors in dataset id ${datasetId}.\n` +
            `\n` +
            `Execution detail: https://api.apify.com/v2/datasets/${datasetId}\n` +
            `Dataset items: https://api.apify.com/v2/datasets/${datasetId}/items?format=json\n` +
            `\n` +
            `Errors log:\n` +
            actOutput.errors.join('\n') +
            `\n` +
            `Happy Crawling`,
    }
};

const actorEmail = (actOutput, actorId, runId, datasetId) => {
    return {
        subject: `Apify notification: ${actOutput.errors.length} errors in actor run id ${runId}`,
        text: `Hi there,\n` +
            `\n` +
            `This is automatic notification from Apify Actors.\n` +
            `We found ${actOutput.errors.length} errors in actor run id ${runId}.\n` +
            `\n` +
            `Actor run detail: https://api.apify.com/v2/acts/${actorId}/runs/${runId}\n` +
            `Actor run dataset items: https://api.apify.com/v2/datasets/${datasetId}/items?format=json\n` +
            `\n` +
            `Errors log:\n` +
            actOutput.errors.join('\n') +
            `\n` +
            `Happy Crawling`,
    }
};

module.exports = {
    crawlerExecutionEmail,
    datasetEmail,
    actorEmail,
};
