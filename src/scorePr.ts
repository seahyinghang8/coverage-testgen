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

    const reviewContent = `
    \`\`\`suggestion
    def test_move_todo(self, manager: TodoManager) -> None:
        manager.create_list("work")
        manager.create_list("personal")

        todo_id = manager.add_todo("Test", "work")
        assert todo_id is not None
        assert manager.move_todo(todo_id, "work", "personal")

        assert manager.get_todo(todo_id, "work") is None
        assert manager.get_todo(todo_id, "personal") is not None
\`\`\`
    `
    octokit.rest.pulls.createReviewComment({
      ...context.repo,
      pull_number: pr,
      body: reviewContent,
      commit_id: '76e0478c29d8ccfe5bde368fcf4f57872f9ca435',
      path: 'tests/test_todo.py',
      start_line: 104,
      start_side: 'RIGHT',
      line: 113,
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
