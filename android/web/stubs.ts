// child_process: only the Store review helper uses it, and that's Windows-only
export const execFile = () => { throw new Error('not on Android') }
