export type TCallbackSuccess<T> = (data: T) => any;
export type TCallbackError = (err: Error) => any;
export type TCallback<T> = (resolve: TCallbackSuccess<T>, reject: TCallbackError) => void;

interface IData<Type, T> {
	type: Type;
	data: T;
}

export class Iterator<T extends ArrayLike<any>> {
	private data: T = [] as any;
	private error: Error | undefined;
	private executed = false;

	constructor(private count: number, private onSuccess: (data: T) => void, private onFail: (data: Error) => void) {}

	public handleSuccess = (data: any, index: number): void => {
		(this.data as any)[index] = data;
		this.count--;
		if (this.count <= 0 && !this.executed) {
			this.executed = true;
			this.onSuccess(this.data);
		}
	};
	public handleError = (error: Error): void => {
		if (!this.executed && !this.error) {
			this.error = error;
			this.executed = true;
			this.onFail(this.error);
		}
	};
}

export class TSyncPromise<T> implements Promise<T> {
	public data?: IData<'resolved', T> | IData<'rejected', any>;

	[Symbol.toStringTag]: 'Promise';

	static resolve<O>(data: O | PromiseLike<O>): TSyncPromise<O> {
		if (data instanceof Promise) {
			return new TSyncPromise<O>((resolve, reject) => data.then(resolve, reject));
		} else if (data && data.toString && data.toString() === 'TSyncPromise') {
			return data as any;
		} else {
			const p = new TSyncPromise<O>(null as any);
			p.data = { type: 'resolved', data: data as any };
			return p;
		}
	}

	static reject<O>(data: any): TSyncPromise<O> {
		const p = new TSyncPromise<O>(null as any);
		p.data = { type: 'rejected', data: data as any };
		return p;
	}

	static all<A1, A2, A3, A4, A5, A6, A7>(
		p: [
			Promise<A1> | A1,
			Promise<A2> | A2,
			Promise<A3> | A3,
			Promise<A4> | A4,
			Promise<A5> | A5,
			Promise<A6> | A6,
			Promise<A7> | A7
		]
	): TSyncPromise<[A1, A2, A3, A4, A5, A6, A7]>;
	static all<A1, A2, A3, A4, A5, A6>(
		p: [Promise<A1> | A1, Promise<A2> | A2, Promise<A3> | A3, Promise<A4> | A4, Promise<A5> | A5, Promise<A6> | A6]
	): TSyncPromise<[A1, A2, A3, A4, A5, A6]>;
	static all<A1, A2, A3, A4, A5>(
		p: [Promise<A1> | A1, Promise<A2> | A2, Promise<A3> | A3, Promise<A4> | A4, Promise<A5> | A5]
	): TSyncPromise<[A1, A2, A3, A4, A5]>;
	static all<A1, A2, A3, A4>(
		p: [Promise<A1> | A1, Promise<A2> | A2, Promise<A3> | A3, Promise<A4> | A4]
	): TSyncPromise<[A1, A2, A3, A4]>;
	static all<A1, A2, A3>(p: [Promise<A1> | A1, Promise<A2> | A2, Promise<A3> | A3]): TSyncPromise<[A1, A2, A3]>;
	static all<A1, A2>(p: [Promise<A1> | A1, Promise<A2> | A2]): TSyncPromise<[A1, A2]>;
	static all<T>(p: TSyncPromise<T>[] | Promise<T>[] | T[]): TSyncPromise<T[]>;
	static all(p: any[]): TSyncPromise<any[]> {
		return new TSyncPromise<any[]>((resolve, reject) => {
			if (!p.length) {
				return resolve([]);
			}
			const iterator = new Iterator(p.length, resolve, reject);
			p.forEach((arg, index) => {
				if (arg instanceof Promise || (arg.toString && arg.toString() === 'TSyncPromise')) {
					arg.then(d => iterator.handleSuccess(d, index), iterator.handleError);
				} else {
					iterator.handleSuccess(arg, index);
				}
			});
		});
	}

	public constructor(fn: TCallback<T>) {
		if (fn) {
			fn(data => this.setData('resolved', data), data => this.setData('rejected', data));
		}
	}

	private onApply: Array<(err: Error, data: T) => void>;

	private setData(type: 'resolved' | 'rejected', data: any) {
		if (!this.data) {
			if (data instanceof Promise || (data && data.toString() === 'TSyncPromise')) {
				data.then(data => this.setData('resolved', data), err => this.setData('rejected', err));
			} else {
				this.data = { type, data } as any;
				if (this.onApply) {
					this.onApply.forEach(cb => {
						cb(type === 'rejected' ? data : undefined, type === 'resolved' ? data : undefined);
					});
					this.onApply = undefined;
				}
			}
		}
	}

	public then<TResult1 = T, TResult2 = never>(
		onfulfilled?: null | ((value: T) => TResult1 | PromiseLike<TResult1>),
		onrejected?: null | ((reason: any) => TResult2 | PromiseLike<TResult2>)
	): TSyncPromise<TResult1 | TResult2> {
		const d = this.data;
		if (d) {
			if (onfulfilled && d.type === 'resolved') {
				const p = onfulfilled(d.data);
				return TSyncPromise.resolve(p);
			} else if (onrejected && d.type === 'rejected') {
				const p = onrejected(d.data);
				return TSyncPromise.resolve(p);
			} else {
				return this as any;
			}
		} else {
			const buf = this.onApply || (this.onApply = []);
			return new TSyncPromise<TResult1 | TResult2>((resolve, reject) =>
				buf.push(_ => {
					const d = this.data;
					if (d.type === 'resolved') {
						const p: any = onfulfilled ? onfulfilled(d.data) : d.data;
						resolve(p as any);
					} else if (d.type === 'rejected') {
						if (onrejected) {
							const p: any = onrejected(d.data);
							resolve(p);
						} else {
							reject(d.data);
						}
					} else {
						reject(new Error('unexpected error'));
					}
				})
			);
		}
	}
	public catch<TResult = never>(
		onrejected?: (reason: any) => TResult | PromiseLike<TResult>
	): TSyncPromise<T | TResult> {
		return this.then(undefined, onrejected);
	}

	public finally<TResult>(onCb?: () => TResult): TSyncPromise<TResult> {
		return this.then(onCb, onCb);
	}

	public toPromise() {
		return new Promise<T>((resolve, reject) => this.then(resolve, reject));
	}
	toString() {
		return 'TSyncPromise';
	}
}
