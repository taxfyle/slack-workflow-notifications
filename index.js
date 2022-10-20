const core = require('@actions/core');
const github = require('@actions/github');
const { WebClient } = require('@slack/web-api');


const statuses = {
    FAILED: 'failed',
    CANCELLED: 'cancelled',
    TIMED_OUT: 'timed_out',
    SUCCESS: 'success'
};

const emojis = {
    [statuses.FAILED]: ':x:',
    [statuses.CANCELLED]: ':no_entry_sign:',
    [statuses.TIMED_OUT]: ':clock10:',
    [statuses.SUCCESS]: ':white_check_mark:'
};

class GithubClient {
    constructor(token) {
        this.octokit = github.getOctokit(token);
        this.context = github.context;
    }

    async getJobs() {
        // Get all jobs except the one that's running this report.
        const jobs = (await this.octokit.paginate(
            this.octokit.rest.actions.listJobsForWorkflowRun,
            { ...this.context.repo, run_id: this.context.runId }
            // `null` conclusion means the job hasn't finished yet, so
            // since there's no way reliably figure out which job is the
            // current job from a list of jobs, it's assumed that this
            // is the last job or the user doesn't care about reporting
            // on any jobs after this one.
        )).filter(j => j.conclusion !== null);

        return jobs;
    }

    async getCurrentWorkflowRun() {
        const response = await this.octokit.rest.actions.getWorkflowRun({
            ...this.context.repo,
            run_id: this.context.runId
        });

        return response.data;
    }
};

function getWorkflowStatus(jobs) {
    let status = statuses.FAILED;

    // For a workflow to be considered successful, every job must be successful.
    if (!jobs.find(j => j.conclusion !== statuses.SUCCESS)) {
        status = statuses.SUCCESS;
    } else {
        // Every subsequent condition is more important than the last. Simply
        // overwriting the status keeps the logic more straightforward.
        if (jobs.some(j => j.conclusion === statuses.CANCELLED)) {
            status = statuses.CANCELLED;
        }

        if (jobs.some(j => j.conclustion === statuses.TIMED_OUT)) {
            status = statuses.TIMED_OUT;
        }

        if (jobs.some(j => j.conclusion === statuses.FAILED)) {
            status = statuses.FAILED;
        }
    }

    return status;
};

async function sendSlackNotification(jobs, run) {
    const context = github.context;
    const condensed = core.getInput('condensed').toLowerCase() === 'true';
    const workflowStatus = getWorkflowStatus(jobs);

    const blocks = [
        {
            'type': 'section',
            'text': {
                'type': 'mrkdwn',
                'text': `${emojis[workflowStatus]} *${context.repo.owner}/${context.repo.repo}* <${run.html_url}|${run.name}>`
            }
        }
    ];

    if (!condensed) {
        blocks.push(jobs.map(j => {
            return {
                'type': 'section',
                'text': {
                    'type': 'mrkdwn',
                    // Default to the :moyai: emoji so that it's obvious if something is wrong with the logic.
                    'text': `<${j.html_url}|${run.head_branch} - ${j.name} ${emojis[j.conclusion] || ':moyai:'}>`
                }
            }
        }));
    }

    const token = core.getInput('slack-token');
    const channels = core.getInput('channels');

    const slack = new WebClient(token);
    await Promise.all(channels.split(',').map(async (channel) => {
        await slack.chat.postMessage({
            channel: channel.trim(),
            blocks: blocks,
            // Slack recommends including this as a fallback in case Block Kit doesn't work for some reason.
            text: `${emojis[workflowStatus]} ${context.repo.owner}/${context.repo.repo}`
        });
    }));
}

async function run() {
    const githubClient = new GithubClient(core.getInput('github-token'));

    const jobs = await githubClient.getJobs();
    const run = await githubClient.getCurrentWorkflowRun();
    await sendSlackNotification(jobs, run);
}

run().catch(e => {
    console.error(e);
    core.setFailed(e.message);
});
