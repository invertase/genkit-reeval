import type { AttemptContext } from 'reeval'

// reeval 0.9.0 keeps its diff snapshot in a git dir the agent can read, one commit per seeded
// file, so `git log -p` there shows the planted change. One root commit keeps the HEAD tree
// reeval diffs against and nothing else.
const SQUASH = [
  'export GIT_DIR="$PWD/../.reeval-git-$(basename "$PWD")" GIT_WORK_TREE="$PWD"',
  'branch=$(git symbolic-ref --short HEAD)',
  'git -c user.name=reeval -c user.email=reeval@localhost -c core.hooksPath=/dev/null checkout -q --orphan squash',
  'git -c user.name=reeval -c user.email=reeval@localhost -c core.hooksPath=/dev/null commit -q --allow-empty -m base',
  'git branch -q -D "$branch"',
  'git branch -q -m "$branch"',
  'git reflog expire --expire=now --all',
  'git gc -q --prune=now',
].join(' && ')

/** Collapses reeval's workspace snapshot history so the agent cannot read the seeded change. */
export const hideSeedHistory = async (c: AttemptContext, name: string): Promise<void> => {
  const r = await c.exec(SQUASH)
  if (r.exitCode !== 0) throw new Error(`${name}: could not squash the snapshot history: ${r.stderr}`)
}
