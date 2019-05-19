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
	var model = new TSNE({
		dim: 2,
		perplexity: 30.0,
		earlyExaggeration: 4.0,
		learningRate: 1000.0,
		nIter: 300,
		metric: "euclidean",
	});

	let lastIter = performance.now();
	model.on("progressIter", iter => {
		// forcefully slow it down
		while (performance.now() - lastIter < 1 / maxFps);
		lastIter = performance.now();
		// data: [iter, error, gradNorm]
		const it = iter[0];
		console.log("iter", it);
		rpc.progressIter(iter);
	});

	model.on("progressStatus", function(status) {
		rpc.progressStatus(status);
	});

	model.on("progressData", function(data) {
		let z = 2;
		for (let i = 0; i < 1e6; i++) z = z ** 2;
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
