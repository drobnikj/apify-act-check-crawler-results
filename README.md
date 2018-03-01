# apify-act-check-crawler-results
This act checks crawler results and send notification if finds some errors.
It is designed to run from [crawler finish webhook](https://www.apify.com/docs#crawler-finishWebhookUrl).

## Usage

For a specific crawler set the following parameters:

### Finish webhook URL (`finishWebhookUrl`)
```
https://api.apify.com/v2/acts/drobnikj~check-crawler-results/runs?token=APIFY_API_TOKEN
```

### Finish webhook data

#### `sampleCount`
- Number
- Number of results that act checks
- Default is 1000


#### `minOutputtedPages`
- Number
- Indicates minimum outputted pages of crawler to checks if attribute is set.


#### `jsonSchema`
- Object
- If jsonSchema is set act check all sample results against schema.


#### `compareWithPreviousExecution`
- Boolean
- If compareWithPreviousExecution is set to `true` act compare results with previous execution.
- If `tag` for execution is set compare act result from previous results with same tag.

#### `runActOnSuccess`
- Object
- If act found errors runs this act.
- Example:
```javascript
{
    "id": "apify/send-mail",
    "input": {
        "to": "jakub.drobnik@apify.com",
        "subject": "test on success",
        "text": "No errors in crawler Amazon"
    }
}
```

#### `runActOnError`
- Object
- If didn't find any errors runs this act.
- Same format as `runActOnSuccess`

