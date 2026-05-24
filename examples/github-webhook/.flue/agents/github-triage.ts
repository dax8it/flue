import { createAgent, defineAgentProfile, dispatch } from '@flue/runtime';
import github, { type GitHubEvent } from '../channels/github.ts';

const triage = defineAgentProfile({
	model: 'anthropic/claude-haiku-4-5',
	instructions: `
You triage inbound GitHub webhook events.
Summarize the event, identify the repository and actor, and suggest the next useful action.
Do not attempt to post back to GitHub; outbound actions are not part of this example.
`,
});

const agent = createAgent(({ id }) => {
	console.log(`[github-triage] create ${id}`);
	return { profile: triage };
});

github.on('issues', async ({ event }) => dispatchEvent('issues', event));
github.on('pull_request', async ({ event }) => dispatchEvent('pull_request', event));

export default agent;

async function dispatchEvent(type: 'issues' | 'pull_request', event: GitHubEvent) {
	console.log(`[github-triage] receive ${type} ${event.deliveryId}`);
	const refs = githubRefs(event);
	if (!refs.repository) return;

	await dispatch(agent, {
		id: `repo:${refs.repository}`,
		session: refs.thread ? `${type}:${refs.thread}` : `delivery:${event.deliveryId}`,
		input: {
			type: `github.${type}`,
			deliveryId: event.deliveryId,
			action: event.action,
			repository: refs.repository,
			thread: refs.thread,
			title: refs.title,
			url: refs.url,
			sender: refs.sender,
		},
	});
}

function githubRefs(event: GitHubEvent) {
	const issue = event.payload.issue as Record<string, any> | undefined;
	const pullRequest = event.payload.pull_request as Record<string, any> | undefined;
	const item = issue ?? pullRequest;
	const repository = event.payload.repository as Record<string, any> | undefined;
	const sender = event.payload.sender as Record<string, any> | undefined;
	return {
		repository: typeof repository?.full_name === 'string' ? repository.full_name : undefined,
		thread: typeof item?.number === 'number' ? String(item.number) : undefined,
		title: typeof item?.title === 'string' ? item.title : undefined,
		url: typeof item?.html_url === 'string' ? item.html_url : undefined,
		sender: typeof sender?.login === 'string' ? sender.login : undefined,
	};
}
