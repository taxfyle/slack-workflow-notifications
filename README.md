# Slack Workflow Notifications Action

Send a notification with your workflow's results to Slack.

The result is derived from the results of the individual jobs that run
before the notification job.

## Usage

Here's an example derived from a real workflow:

```yaml
name: Staging
on:
  push:
    branches:
      - develop
jobs:
  lint:
    runs-on: ubuntu-22.04
    steps:
      - name: Checkout
        uses: actions/checkout@v3
      - name: "Run Linter"
        run: ./scripts/lint.sh
  tests:
    name: "Tests"
    uses: ./.github/workflows/callables.tests.yaml
    secrets: inherit
  build-and-push:
    name: "API Container Image"
    uses: ./.github/workflows/callables.build-and-push.yaml
    secrets: inherit

  report-status:
    name: "Report CI Status"
    # Make sure this job runs after all the jobs you want to report on. Any
    # jobs that haven't finished with a conclusion (i.e. conclusion is null)
    # will be ignored, including this one.
    needs: [build-and-push, tests, lint]
    runs-on: [ubuntu-latest]
    # Run this even if the job is canceled so it can be reported.
    if: always()
    steps:
      - uses: taxfyle/slack-workflow-notifications@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          slack-token: ${{ secrets.SLACK_GITHUB_ACTIONS_BOT_TOKEN }}
          channels: '#bot-test-channel' # single channel or comma-separated list
```

### Inputs

`github-token`: **required**

Sets the token used to interact with the Github API.

`slack-token`: **required**

Sets the token used to interact with the Slack API. Should be a bot OAuth token with
the [`chat.write`](https://api.slack.com/scopes/chat:write) scope.

`channels`: **required**

Comma-separated list of channels to send the notification message to.

`condensed`: **required**, defaults to `'true'`

Hides the individual job statuses from the message.
