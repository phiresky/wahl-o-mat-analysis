type CallbackResolveData = {
	id: number;
	type: "resolve" | "reject";
	payload: any;
};
type RPCData = { name: string; args: any[]; callback: number };
type PostMessages =
	| {
			type: "RPC";
			rpc: RPCData;
	  }
	| {
			type: "CALLBACK";
			cb: CallbackResolveData;
	  };
function callbackStore() {
	let nextCallbackId = 0;
	const callbacks = new Map<number, (d: CallbackResolveData) => void>();
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
	function serveCallback(data: CallbackResolveData) {
		const cb = callbacks.get(data.id);
		if (!cb) throw Error(`callback gone: ${data.id}`);
		cb(data);
	}
	return { getCallback, serveCallback };
}

function getRpc(
	remote: {
		postMessage(data: PostMessages): void;
		addEventListener(
			ev: "message",
			handler: (p: { data: PostMessages }) => void,
		): void;
	},
	localPromise: Promise<any>,
) {
	const { getCallback, serveCallback } = callbackStore();
	const rpc = new Proxy(
		{},
		{
			has(name: string | number | symbol) {
				return typeof name === "string";
			},
			get(target: {}, name: string | number | symbol) {
				if (typeof name !== "string") return undefined;
				return (...args: any[]) => {
					const { id, promise } = getCallback();
					remote.postMessage({
						type: "RPC",
						rpc: { name, args, callback: id },
					});
					return promise;
				};
			},
		},
	);
	let local: any;
	async function handleRPC(p: RPCData) {
		if (!local) local = await localPromise;
		const cb: CallbackResolveData = {
			type: "resolve",
			id: p.callback,
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
			remote.postMessage({ type: "CALLBACK", cb });
		}
	}

	remote.addEventListener("message", p => {
		if (p.data.type === "CALLBACK") {
			serveCallback(p.data.cb);
		} else if (p.data.type === "RPC") {
			handleRPC(p.data.rpc);
		} else {
			console.warn("unknown message", p);
		}
	});
	return rpc;
}

export function simpleWorker<
	toMain extends { [k: string]: (...args: any) => Promise<any> },
	toWorker extends { [k: string]: (...args: any) => Promise<any> }
>(init: (rpc: toMain) => Promise<toWorker>) {
	let _res;
	let localPromise = new Promise(r => (_res = r));
	const toMain = getRpc(self as any, localPromise);
	init(toMain as any).then(_res);
}

export function createWorker<
	toMain extends { [k: string]: (...args: any) => Promise<any> },
	toWorker extends { [k: string]: (...args: any) => Promise<any> }
>(worker: Worker, handler: toMain) {
	const rpc = getRpc(worker, Promise.resolve(handler));
	return rpc as toWorker;
}
