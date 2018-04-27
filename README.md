# apify-act-check-crawler-results
This act checks crawler results or default act dataset items and send notification if finds some errors.
It is designed to run from [crawler finish webhook](https://www.apify.com/docs#crawler-finishWebhookUrl).

## Usage Crawler

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

### `notifyTo`
- String
- Mail where act send notification if found error

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
NOTE: If you didn't set `input`, it set from input of main act and errors output.

#### `runActOnError`
- Object
- If didn't find any errors runs this act.
- Same format as `runActOnSuccess`

## Usage Act

You can all it from other Act, for example:
```javascript
await Apify.call('drobnikj/check-crawler-results', {
    actId: 's7Jj8ik07gfV',
    runId: 'sd86hGfHk0Uh6gF',
    options: {
        minOutputtedPages: 1000,
    }
});
```

### actId
- String
- Act ID you want to check

### runId
- String
- Run ID of act you want to check

### options
- Object
- Options for checking
- There are same params as in `Finish webhook data` except `compareWithPreviousExecution`
- `sampleCount`, `jsonSchema`, `notifyTo`, `runActOnSuccess`, `runActOnError`

