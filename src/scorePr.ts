import * as core from '@actions/core'

import {FilesCoverage} from './coverage'
import {formatAverageTable, formatFilesTable, toPercent} from './format'
import {context} from '@actions/github'
import {octokit} from './client'

const TITLE = `# ☂️ Python Coverage`

export async function publishMessage(pr: number, message: string): Promise<void> {
  const body = TITLE.concat(message)
  core.summary.addRaw(body).write()

  const comments = await octokit.rest.issues.listComments({
    ...context.repo,
    issue_number: pr
  })
  const exist = comments.data.find(commnet => {
    return commnet.body?.startsWith(TITLE)
  })

  if (exist) {
    await octokit.rest.issues.updateComment({
      ...context.repo,
      issue_number: pr,
      comment_id: exist.id,
      body
    })
  } else {
    await octokit.rest.issues.createComment({
      ...context.repo,
      issue_number: pr,
      body
    })

    const add1 = `
🌪 CGFT TestGen: Verifies that TodoManager sends reminders for overdue tasks.
\`\`\`suggestion
    @patch.object(ReminderService, 'send_reminders_for_overdue')
    def test_send_overdue_reminders(self, mock_send_reminders: MagicMock, manager: TodoManager) -> None:
        # Setup: Create some overdue tasks
        yesterday = datetime.now() - timedelta(days=1)
        manager.add_todo("Overdue task 1", due_date=yesterday)
        manager.add_todo("Overdue task 2", due_date=yesterday)

        # Call the method to send reminders for overdue todos
        manager.send_overdue_reminders()

        # Ensure the ReminderService was called
        mock_send_reminders.assert_called_once()
        overdue_todos = manager.get_all_overdue_todos()
        mock_send_reminders.assert_called_with(overdue_todos["default"])
\`\`\``
    octokit.rest.pulls.createReviewComment({
      ...context.repo,
      pull_number: pr,
      body: add1,
      commit_id: '50ea48d0219c38cae5c042849fa0dad87bee6178',
      path: 'tests/test_todo.py',
      line: 144,
      side: 'RIGHT'
    })

    const add2 = `
🌪 CGFT TestGen: Verifies ReminderService handles failed reminder API requests + Verifies overdue reminders are sent successfully
\`\`\`suggestion


@patch("todo.reminder_service.requests.post")
def test_send_reminder_failure(self, mock_post: MagicMock, sample_todo: Todo) -> None:
    # Simulate a failure API response
    mock_post.return_value.status_code = 400

    reminder_service = ReminderService(
        api_url="https://dummy.api.com", api_key="test-api-key")
    result = reminder_service.send_reminder(sample_todo)

    assert result is False


    @patch("todo.reminder_service.requests.post")
    def test_send_reminders_for_overdue(self, mock_post: MagicMock, todo_list: TodoList, sample_todo: Todo) -> None:
        # Simulate a successful API response for all reminders
        mock_post.return_value.status_code = 200

        todo_list.add_todo(sample_todo)  # Add an overdue todo to the list
        reminder_service = ReminderService(
            api_url="https://dummy.api.com", api_key="test-api-key")
        reminder_service.send_reminders_for_overdue([sample_todo])

        # Ensure the POST request was made
        mock_post.assert_called_once()
\`\`\`
`
    octokit.rest.pulls.createReviewComment({
      ...context.repo,
      pull_number: pr,
      body: add2,
      commit_id: '50ea48d0219c38cae5c042849fa0dad87bee6178',
      path: 'tests/test_todo.py',
      line: 171,
      side: 'RIGHT'
    })
  }
}

export function scorePr(filesCover: FilesCoverage): boolean {
  let message = ''
  let passOverall = true

  core.startGroup('Results')
  const {coverTable: avgCoverTable, pass: passTotal} = formatAverageTable(filesCover.averageCover)
  message = message.concat(`\n## Overall Coverage\n${avgCoverTable}`)
  passOverall = passOverall && passTotal
  const coverAll = toPercent(filesCover.averageCover.ratio)
  passTotal ? core.info(`Average coverage ${coverAll} ✅`) : core.error(`Average coverage ${coverAll} ❌`)

  if (filesCover.newCover?.length) {
    const {coverTable, pass: passNew} = formatFilesTable(filesCover.newCover)
    passOverall = passOverall && passNew
    message = message.concat(`\n## New Files\n${coverTable}`)
    passNew ? core.info('New files coverage ✅') : core.error('New Files coverage ❌')
  } else {
    message = message.concat(`\n## New Files\nNo new covered files...`)
    core.info('No covered new files in this PR ')
  }

  if (filesCover.modifiedCover?.length) {
    const {coverTable, pass: passModified} = formatFilesTable(filesCover.modifiedCover)
    passOverall = passOverall && passModified
    message = message.concat(`\n## Modified Files\n${coverTable}`)
    passModified ? core.info('Modified files coverage ✅') : core.error('Modified Files coverage ❌')
  } else {
    message = message.concat(`\n## Modified Files\nNo covered modified files...`)
    core.info('No covered modified files in this PR ')
  }
  const sha = context.payload.pull_request?.head.sha.slice(0, 7)
  const action = '[action](https://github.com/marketplace/actions/python-coverage)'
  message = message.concat(`\n\n\n> **updated for commit: \`${sha}\` by ${action}🐍**`)
  message = `\n> current status: ${passOverall ? '✅' : '❌'}`.concat(message)
  publishMessage(context.issue.number, message)
  core.endGroup()

  return passOverall
}
