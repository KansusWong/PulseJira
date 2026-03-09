/**
 * Git workspace — manages git operations within a sandboxed directory.
 *
 * Uses execFile (not shell) to prevent command injection.
 */

import { CommandRunner } from './command-runner';

export class GitWorkspace {
  private runner: CommandRunner;

  constructor(private localPath: string) {
    this.runner = new CommandRunner(localPath, ['git']);
  }

  async clone(repoUrl: string, branch?: string): Promise<void> {
    const args = ['clone', '--depth', '1'];
    if (branch) args.push('--branch', branch);
    args.push(repoUrl, '.');

    const result = await this.runner.run('git', args);
    if (result.exitCode !== 0) {
      throw new Error(`git clone failed: ${result.stderr}`);
    }
  }

  async createBranch(name: string): Promise<void> {
    const result = await this.runner.run('git', ['checkout', '-b', name]);
    if (result.exitCode !== 0) {
      throw new Error(`git checkout -b failed: ${result.stderr}`);
    }
  }

  async add(files: string[] = ['.']): Promise<void> {
    const result = await this.runner.run('git', ['add', ...files]);
    if (result.exitCode !== 0) {
      throw new Error(`git add failed: ${result.stderr}`);
    }
  }

  async commit(message: string): Promise<string> {
    await this.add();
    const result = await this.runner.run('git', ['commit', '-m', message, '--allow-empty']);
    if (result.exitCode !== 0) {
      throw new Error(`git commit failed: ${result.stderr}`);
    }

    // Get commit SHA
    const sha = await this.runner.run('git', ['rev-parse', 'HEAD']);
    return sha.stdout.trim();
  }

  async push(remote: string = 'origin'): Promise<void> {
    // Get current branch name
    const branchResult = await this.runner.run('git', ['branch', '--show-current']);
    const branch = branchResult.stdout.trim();

    const result = await this.runner.run('git', ['push', '-u', remote, branch]);
    if (result.exitCode !== 0) {
      throw new Error(`git push failed: ${result.stderr}`);
    }
  }

  async status(): Promise<string> {
    const result = await this.runner.run('git', ['status', '--short']);
    return result.stdout;
  }

  async diff(): Promise<string> {
    const result = await this.runner.run('git', ['diff', '--stat']);
    return result.stdout;
  }

  async log(n: number = 5): Promise<string> {
    const result = await this.runner.run('git', [
      'log',
      `--max-count=${n}`,
      '--oneline',
    ]);
    return result.stdout;
  }
}
