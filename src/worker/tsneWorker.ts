import TSNE from "../../tsne-js/src/index.js";
import { simpleWorker } from "./simple-worker";

export type toMain = {
	STATUS: (s: "BUSY" | "READY") => Promise<void>;
	progressIter(iter: [number, number, number]): Promise<void>;
	progressStatus(status: string): Promise<void>;
	progressData(data: [number, number][]): Promise<void>;
};
export type toWorker = {
	INPUT_DATA: (d: number[][]) => Promise<void>;
	RUN: (d: {
		perplexity: number;
		earlyExaggeration: number;
		learningRate: number;
		nIter: number;
		metric: string;
	}) => Promise<any>;
};
const maxFps = 1 / 30;
simpleWorker<toMain, toWorker>(async rpc => {
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
		INPUT_DATA: async data => {
			model.init({
				data,
				type: "dense",
			});
		},
		RUN: async data => {
			model.perplexity = data.perplexity;
			model.earlyExaggeration = data.earlyExaggeration;
			model.learningRate = data.learningRate;
			model.nIter = data.nIter;
			model.metric = data.metric;
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
