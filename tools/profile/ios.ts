import { writeFile } from 'node:fs/promises';
import type { Profiler } from 'node:inspector';

const endpoint = process.argv[2] ?? 'http://127.0.0.1:16086';
const duration = Number(process.argv[3] ?? 10);
const output = process.argv[4] ?? '/tmp/pvz-ios-js.cpuprofile';
if (!Number.isFinite(duration) || duration <= 0) throw new Error('Duration must be a positive number of seconds');

const targets: { webSocketDebuggerUrl?: string }[] = await (await fetch(`${endpoint}/json/list`)).json();
const target = targets.find(item => item.webSocketDebuggerUrl);
if (!target?.webSocketDebuggerUrl) throw new Error('V8 inspector target not found');
// Device targets may advertise a device-side address; connect through the forwarded port.
const socketUrl = new URL(target.webSocketDebuggerUrl);
const forwarded = new URL(endpoint);
socketUrl.host = forwarded.host;
const socket = new WebSocket(socketUrl);
await new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve(), { once: true });
    socket.addEventListener('error', reject, { once: true });
});
let nextId = 0;
const pending = new Map<number, { resolve: (result: any) => void; reject: (error: Error) => void }>();
socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
});
socket.addEventListener('close', () => {
    for (const request of pending.values()) request.reject(new Error('Inspector connection closed'));
    pending.clear();
});
function send<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const id = ++nextId;
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
    });
}
try {
    await send('Profiler.enable');
    await send('Profiler.setSamplingInterval', { interval: 1000 });
    await send('Profiler.start');
    console.log(`Sampling for ${duration} seconds...`);
    await new Promise(resolve => setTimeout(resolve, duration * 1000));
    const { profile } = await send<{ profile: Profiler.Profile }>('Profiler.stop');
    await writeFile(output, JSON.stringify(profile));
    const nodes = new Map(profile.nodes.map(node => [node.id, node]));
    const times = new Map<number, number>();
    for (let i = 0; i < (profile.samples?.length ?? 0); i++) {
        const id = profile.samples![i];
        times.set(id, (times.get(id) ?? 0) + (profile.timeDeltas?.[i] ?? 0));
    }
    console.log(`Saved ${output}; top self time:`);
    for (const [id, microseconds] of [...times].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
        const frame = nodes.get(id)?.callFrame;
        console.log(`${(microseconds / 1000).toFixed(1)} ms  ${frame?.functionName || '(anonymous)'}  ${frame?.url || ''}:${(frame?.lineNumber ?? -1) + 1}`);
    }
} finally {
    socket.close();
}
