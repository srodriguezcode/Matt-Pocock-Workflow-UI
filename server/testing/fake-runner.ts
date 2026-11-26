import type { CommandRunner, RunOptions, RunResult } from '#server/core/runner.ts';

export interface Call {
  command: string;
  args: string[];
  options: RunOptions;
}

type Reply = Partial<RunResult> | ((call: Call) => Partial<RunResult>);

interface Rule {
  prefix: string[];
  reply: Reply;
  times: number;
}

/** Answers commands whose `[command, ...args]` start with a registered prefix. The latest rule wins. */
export class FakeRunner implements CommandRunner {
  readonly calls: Call[] = [];
  private readonly rules: Rule[] = [];

  on(prefix: string[], reply: Reply, times = Infinity): this {
    this.rules.unshift({ prefix, reply, times });
    return this;
  }

  async run(command: string, args: string[], options: RunOptions = {}): Promise<RunResult> {
    const call = { command, args, options };
    this.calls.push(call);
    const line = [command, ...args];
    const rule = this.rules.find(
      (r) => r.times > 0 && r.prefix.every((part, i) => line[i] === part),
    );
    if (!rule) return { code: 127, stdout: '', stderr: `fake: no reply for ${line.join(' ')}` };
    rule.times -= 1;
    const reply = typeof rule.reply === 'function' ? rule.reply(call) : rule.reply;
    return { code: 0, stdout: '', stderr: '', ...reply };
  }

  lines(): string[] {
    return this.calls.map((call) => [call.command, ...call.args].join(' '));
  }
}
