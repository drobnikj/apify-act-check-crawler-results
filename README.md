# Scraper Results Checker
This actor checks results from Apify's scrapers or any other actor that stores its result to a dataset, and sends a notification if there are errors. It's designed to run from webhook.

  * [Usage](#usage)
    * [Actor/Task webhook](#actor-or-task-webhook)
    * [Actor](#actor)
    * [Legacy Crawler DEPRECATED](#legacy-crawler-DEPRECATED)
  * [Fields](#fields)
    * [actId](#actid)
    * [runId](#runid)
    * [datasetId](#datasetid)
    * [options](#options)
  * [Output](#output)

# Usage

## Actor or Task webhook

You can set up webhook for Actor or Task with URL:
```
https://api.apify.com/v2/acts/drobnikj~check-crawler-results/runs?token=APIFY_API_TOKEN
```

Then you need to set up payload template for webhook data like:
```
{
    "actId": {{resource.actId}},
    "runId": {{resource.id}},
    "options": {
      "notifyTo": "jakub.drobnik@apify.com",
      "minOutputtedPages": 10
    }
}
```

## Actor

You can call it from other Actor, for example:
```javascript
await Apify.call('drobnikj/check-crawler-results', {
    actId: 's7Jj8ik07gfV',
    runId: 'sd86hGfHk0Uh6gF',
    options: {
        minOutputtedPages: 1000,
    }
});
```

## Legacy Crawler DEPRECATED

For a specific crawler set the following parameters:

### Finish webhook URL (`finishWebhookUrl`)
```
https://api.apify.com/v2/acts/drobnikj~check-crawler-results/runs?token=APIFY_API_TOKEN
```

### Finish webhook data

You can set up fields from [options](#options) to finish webhook data.

## Fields

### `actId`
- String
- Act ID you want to check

### `runId`
- String
- Run ID of actor you want to check

### `datasetId`
- String
- Dataset ID

### `options`
- Object

#### `options.sampleCount`
- Number
- Number of results that actor checks
- Default is 100000


#### `options.minOutputtedPages`
- Number
- Indicates minimum outputted items to checks.


#### `options.jsonSchema`
- Object
- If jsonSchema is set actor check all sample results against schema.


#### `options.compareWithPreviousExecution`
- Boolean
- If compareWithPreviousExecution is set to `true` actor compare results with a previous execution.
- If `tag` for execution is set compare actor result from previous results with the same tag.
- It works only for the legacy crawler.

#### `options.notifyTo`
- String
- Mail where actor send notification if found error

#### `options.runActOnSuccess`
- Object
- If actor found errors runs this actor.
- Example:
```json
{
    "id": "apify/send-mail",
    "input": {
        "to": "jakub.drobnik@apify.com",
        "subject": "test on success",
        "text": "No errors in crawler Amazon"
    }
}
```
NOTE: If you didn't set `input`, it set from input of main actor and errors output.

#### `options.runActOnError`
- Object
- If didn't find any errors runs this actor.
- Same format as `runActOnSuccess`

# Output

All found errors will be in the `errors` field.

## Example output
```json
{
  "errors": [
    "Run is not in SUCCEEDED status, act status: ABORTED",
    "Crawler returns only 0 outputted pages and minumum is 100"
  ],
  "executionAttrs": []
}
```


