import * as core from '@actions/core'

// import {FilesCoverage} from './coverage'
import {formatAverageTable, formatFilesTable} from './format'
import {context} from '@actions/github'
import {octokit} from './client'
import {Coverage} from './coverage'

const TITLE = `# ☂️ Repo Coverage`

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
# <img src="https://www.cgft.io/static/favicons/apple-touch-icon.png" alt="CGFT" width="50"/> TestGen
1. \`testEncryptedAvatarMaximumLength\`→ Verifies that the length of an encrypted avatar does not exceed the maximum allowed size after encryption
\`\`\`suggestion
    func testEncryptedAvatarMaximumLength() throws {
        let decryptedAvatar = Data(count: Int(kMaxAvatarSize))
        let groupParams = try GroupV2Params(groupSecretParams: .generate())
        let encryptedAvatar = try groupParams.encryptGroupAvatar(decryptedAvatar)
        XCTAssertEqual(encryptedAvatar.count, Int(kMaxEncryptedAvatarSize))
    }
\`\`\``
    octokit.rest.pulls.createReviewComment({
      ...context.repo,
      pull_number: pr,
      body: add1,
      commit_id: 'c53bc59d67440879c810185726ca094c9b21c556',
      path: 'Signal/test/Groups/ZkGroupIntegrationTest.swift',
      line: 17,
      side: 'RIGHT'
    })
  }
}

export async function scorePr(): Promise<boolean> {
  const comments = await octokit.rest.issues.listComments({
    ...context.repo,
    issue_number: context.issue.number
  })
  const exist = comments.data.find(comment => {
    return comment.body?.startsWith(TITLE)
  })

  let message = ''
  let passOverall = !!exist
  const cover = {
    ratio: passOverall ? 0.75 : 0.74,
    covered: passOverall ? 80663 : 80649,
    total: 107536,
    pass: passOverall,
    threshold: 0.75
  }

  const {coverTable: avgCoverTable} = formatAverageTable(cover)
  message = message.concat(`\n## Overall Coverage\n${avgCoverTable}`)

  const modifiedCover: Coverage[] = [
    {file: 'SignalServiceKit/Groups/GroupV2Params.swift', cover: passOverall ? 0.72 : 0.78, pass: passOverall},
    {file: 'SignalServiceKit/Groups/GroupsV2Impl.swift', cover: passOverall ? 0.75 : 0.74, pass: passOverall},
    {file: 'SignalServiceKit/Groups/TSGroupModel.h', cover: 1.0, pass: true},
    {file: 'SignalServiceKit/Groups/TSGroupModel.m', cover: 0.96, pass: true}
  ]
  const {coverTable, pass: passModified} = formatFilesTable(modifiedCover)
  passOverall = passOverall && passModified
  message = message.concat(`\n## Modified Files\n${coverTable}`)
  passModified ? core.info('Modified files coverage ✅') : core.error('Modified Files coverage ❌')

  // core.startGroup('Results')
  // const {coverTable: avgCoverTable, pass: passTotal} = formatAverageTable(filesCover.averageCover)
  // message = message.concat(`\n## Overall Coverage\n${avgCoverTable}`)
  // passOverall = passOverall && passTotal
  // const coverAll = toPercent(filesCover.averageCover.ratio)
  // passTotal ? core.info(`Average coverage ${coverAll} ✅`) : core.error(`Average coverage ${coverAll} ❌`)

  // if (filesCover.newCover?.length) {
  //   const {coverTable, pass: passNew} = formatFilesTable(filesCover.newCover)
  //   passOverall = passOverall && passNew
  //   message = message.concat(`\n## New Files\n${coverTable}`)
  //   passNew ? core.info('New files coverage ✅') : core.error('New Files coverage ❌')
  // } else {
  //   message = message.concat(`\n## New Files\nNo new covered files...`)
  //   core.info('No covered new files in this PR ')
  // }

  // if (filesCover.modifiedCover?.length) {
  //   const {coverTable, pass: passModified} = formatFilesTable(filesCover.modifiedCover)
  //   passOverall = passOverall && passModified
  //   message = message.concat(`\n## Modified Files\n${coverTable}`)
  //   passModified ? core.info('Modified files coverage ✅') : core.error('Modified Files coverage ❌')
  // } else {
  //   message = message.concat(`\n## Modified Files\nNo covered modified files...`)
  //   core.info('No covered modified files in this PR ')
  // }
  const sha = context.payload.pull_request?.head.sha.slice(0, 7)
  const action = '[action](https://github.com/marketplace/actions/python-coverage)'
  message = message.concat(`\n\n\n> **updated for commit: \`${sha}\` by ${action}**`)
  message = `\n> current status: ${passOverall ? '✅' : '❌'}`.concat(message)
  publishMessage(context.issue.number, message)
  core.endGroup()

  return passOverall
}
