type CallData = {
	name: string;
	args: any[];
	id: number;
};
type CallbackData = {
	id: number;
	type: "resolve" | "reject";
	payload: any;
};
type PostMessageData =
	| { type: "call"; rpc: CallData }
	| { type: "callback"; cb: CallbackData };

type RemoteInterface = { [k: string]: (...args: any) => Promise<any> };

/** create a map of unfinished callbacks */
function callbackStore() {
	let nextCallbackId = 0;
	const callbacks = new Map<number, (d: CallbackData) => void>();
	function getCallback() {
		const id = ++nextCallbackId;
		let o = { resolve: null! as Function, reject: null! as Function };
		const promise = new Promise(
			(s, j) => ((o.resolve = s), (o.reject = j)),
		);
		callbacks.set(id, ({ type, payload }) => {
			callbacks.delete(id);
			o[type](payload);
		});
		return { id, promise };
	}
	function answerCallback(data: CallbackData) {
		const cb = callbacks.get(data.id);
		if (!cb) throw Error(`callback gone: ${data.id}`);
		cb(data);
	}
	return { getCallback, answerCallback };
}

/**
 * Connect a postMessage/addEventListener function pair to a local interface and return the remote interface. Call this from both sides.
 *
 * The local RPC interface can be passed as a Promise to facilitate two-way binding
 *
 */
function getRpcProxy<
	TLocal extends RemoteInterface,
	TRemote extends RemoteInterface
>(
	eventHandle: {
		postMessage(data: PostMessageData): void;
		addEventListener(
			ev: "message",
			handler: (ev: { data: PostMessageData }) => void,
		): void;
	},
	localPromise: Promise<TLocal>,
): TRemote {
	const { getCallback, answerCallback } = callbackStore();
	const rpc = new Proxy(
		{},
		{
			has(_, name) {
				return typeof name === "string";
			},
			get(_, name) {
				if (typeof name !== "string") return undefined;
				return (...args: any[]) => {
					const { id, promise } = getCallback();
					eventHandle.postMessage({
						type: "call",
						rpc: { name, args, id },
					});
					return promise;
				};
			},
		},
	) as TRemote;
	let local: TLocal;
	async function handleRPC(p: CallData) {
		if (!local) local = await localPromise;
		const cb: CallbackData = {
			type: "resolve",
			id: p.id,
			payload: null,
		};
		try {
			if (typeof local[p.name] !== "function") {
				throw Error(`No RPC method "${p.name}" found`);
			}
			cb.payload = await local[p.name](...p.args);
		} catch (e) {
			cb.type = "reject";
			cb.payload = e;
		} finally {
			eventHandle.postMessage({ type: "callback", cb });
		}
	}

	eventHandle.addEventListener("message", ev => {
		if (ev.data.type === "callback") {
			answerCallback(ev.data.cb);
		} else if (ev.data.type === "call") {
			handleRPC(ev.data.rpc);
		} else {
			console.warn("unknown message", ev);
		}
	});
	return rpc;
}

export function declareWorker<
	TMaster extends RemoteInterface,
	TWorker extends RemoteInterface
>(init: (rpc: TMaster) => Promise<TWorker>) {
	if (typeof self === "undefined" || typeof importScripts === "undefined")
		throw Error(`Call this function from a worker script`);
	let resolveLocal;
	const toMain = getRpcProxy<TWorker, TMaster>(
		self as any, // DedicatedWorkerGlobalScope
		new Promise(r => (resolveLocal = r)),
	);
	init(toMain).then(resolveLocal);
}

export function createWorker<
	TMaster extends RemoteInterface,
	TWorker extends RemoteInterface
>(worker: Worker, handler: TMaster): TWorker {
	if (typeof window === "undefined")
		throw Error(`call this function from the main browser thread`);
	return getRpcProxy<TMaster, TWorker>(worker, Promise.resolve(handler));
}
