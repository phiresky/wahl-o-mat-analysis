import TSNE from "../tsne-js/src/index.js";
import { declareWorker } from "./simple-typed-worker";

export type TSNEMaster = {
	progressIter(iter: [number, number, number]): Promise<void>;
	progressStatus(status: string): Promise<void>;
	progressData(data: [number, number][]): Promise<void>;
};
export type TSNEWorker = {
	setData(d: number[][]): Promise<void>;
	run(d: {
		perplexity: number;
		earlyExaggeration: number;
		learningRate: number;
		nIter: number;
		metric: string;
	}): Promise<[number, number][]>;
};
const maxFps = 1 / 30;
declareWorker<TSNEMaster, TSNEWorker>(async rpc => {
	const model = new TSNE();
	Object.assign(globalThis, { model });

	let lastIter = performance.now();
	model.on("progressIter", iter => {
		// forcefully slow it down
		while (performance.now() - lastIter < 1 / maxFps);
		lastIter = performance.now();
		rpc.progressIter(iter);
	});

	model.on("progressStatus", function(status) {
		rpc.progressStatus(status);
	});

	model.on("progressData", function(data) {
		rpc.progressData(data);
	});

	var firstRun = true;
	return {
		async setData(data) {
			model.init({
				data,
				type: "dense",
			});
		},
		async run(data) {
			Object.assign(model, data);
			if (firstRun) {
				model.run();
				firstRun = false;
			} else {
				model.rerun();
			}

			return model.getOutputScaled();
		},
	};
});
