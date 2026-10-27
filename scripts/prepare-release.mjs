import { execFileSync } from 'node:child_process'
import { readFileSync, appendFileSync } from 'node:fs'

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()
const version = JSON.parse(readFileSync('package.json', 'utf8')).version
const stable = /^(\d+)\.(\d+)\.(\d+)$/
if (!stable.test(version)) throw new Error('Automatic releases require a stable x.y.z version')
const tag = `v${version}`
const headTags = git('tag', '--points-at', 'HEAD').split('\n')
let next = version
let publish = true

if (headTags.includes(tag)) {
  // Resume a failed publish with the same tag; never overwrite a public release.
  const releases = JSON.parse(
    execFileSync(
      'gh',
      ['api', '--paginate', '--slurp', 'repos/{owner}/{repo}/releases?per_page=100'],
      {
        encoding: 'utf8'
      }
    )
  ).flat()
  publish = !releases.some((release) => release.tag_name === tag && !release.draft)
} else {
  const versions = git('tag', '--list', 'v*')
    .split('\n')
    .map((value) => value.slice(1))
    .filter((value) => stable.test(value))
    .map((value) => value.split('.').map(Number))
  const compare = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
  versions.sort(compare)
  const latest = versions.at(-1)
  if (latest && compare(latest, version.split('.').map(Number)) >= 0) {
    next = `${latest[0]}.${latest[1]}.${latest[2] + 1}`
  }
  // npm's CLI is invoked through Node for consistent Windows argument handling.
  if (next !== version) {
    execFileSync('npm', ['version', next, '--no-git-tag-version', '--ignore-scripts'], {
      stdio: 'inherit',
      shell: process.platform === 'win32'
    })
  }
}
appendFileSync(process.env.GITHUB_OUTPUT, `version=${next}\ntag=v${next}\npublish=${publish}\n`)
console.log(publish ? `Preparing v${next}` : `${tag} is already published`)
