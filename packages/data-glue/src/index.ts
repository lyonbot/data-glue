import { memoWithWeakMap } from './memoWithWeakMap';

export type Nothing = undefined | null | void;
export type Val = any;
export type Prop = string | symbol;
export type Obj = Record<Prop, any>;

export interface RawValueAndDescriptor<T = Val> {
  rawValue: T;
  descriptor: Descriptor;
}

export interface GlueConfig {
  getNode(nodeId: any): RawValueAndDescriptor;
}

export type Descriptor = ObjectDescriptor | ForwardTo | Nothing;

export interface ObjectDescriptor {
  describeProp?(key: Prop, rawValue: Val, self: Obj): Descriptor;

  receiveValue?(
    newValue: Val,
    newValueIsProxied: RawValueAndDescriptor<any> | null,
    key: Prop,
    oldRawValue: Val,
    self: Obj,
  ): Val;

  beforeDelete?(key: Prop, rawValue: Val, self: Obj): void;
}

export function forwardTo(nodeId: any) {
  return new ForwardTo(nodeId);
}

class ForwardTo {
  constructor(public nodeId: any) {}
}

export class GlueData {
  constructor(public config: GlueConfig) {}

  get<T = any>(nodeId: any): T {
    const { rawValue, descriptor } = this.config.getNode(nodeId);
    return this.wrapProxy(rawValue, descriptor);
  }

  private _proxy2raw = new WeakMap<Obj, RawValueAndDescriptor>();

  private _od2proxyHandler = memoWithWeakMap((descriptor: ObjectDescriptor) => {
    const ans: ProxyHandler<any> = {};

    if (descriptor.describeProp) {
      ans.get = (target, key) => {
        const rawValue = target[key];
        const subDesc = descriptor.describeProp!(key, rawValue, target);
        return this.wrapProxy(rawValue, subDesc);
      };
    }

    if (descriptor.receiveValue) {
      ans.set = (target, key, value) => {
        const rawValue = target[key];
        const transformedValue = descriptor.receiveValue!(
          value,
          this._proxy2raw.get(value) || null, // newValueIsProxied
          key,
          rawValue,
          target,
        );
        return Reflect.set(target, key, transformedValue);
      };
    }

    if (descriptor.beforeDelete) {
      ans.deleteProperty = (target, key) => {
        descriptor.beforeDelete!(key, target[key], target);
        return Reflect.deleteProperty(target, key);
      };
    }

    if (!Object.keys(ans).length) return null;
    return ans;
  });

  private _rawObj2proxy = new WeakMap<Obj, { (descriptor: ObjectDescriptor): any }>();

  wrapProxy(rawValue: Val, descriptor: Descriptor) {
    if (!rawValue || !descriptor) return rawValue;

    // 1. handle forward

    if (descriptor instanceof ForwardTo) return this.get(descriptor.nodeId);

    // 2. handle ObjectDescriptor

    if (typeof rawValue !== 'object') return rawValue;

    let cvt = this._rawObj2proxy.get(rawValue);
    if (!cvt) {
      cvt = memoWithWeakMap(desc => {
        const proxyHandler = this._od2proxyHandler(desc);
        const proxy = proxyHandler ? new Proxy(rawValue, proxyHandler) : rawValue;

        this._proxy2raw.set(proxy, { rawValue, descriptor });

        return proxy;
      });
      this._rawObj2proxy.set(rawValue, cvt);
    }

    return cvt(descriptor);
  }

  /**
   * get the raw value of a proxied value.
   *
   * beware: this will NOT trace back `forwardTo` - the nearest object will be returned.
   *
   * @param proxiedValue
   */
  unwrapProxy<T = any>(proxiedValue: T): RawValueAndDescriptor<T> {
    const ans = this._proxy2raw.get(proxiedValue);
    if (!ans) return { rawValue: proxiedValue, descriptor: undefined };
    return ans;
  }
}
