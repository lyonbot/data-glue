import { forwardTo, GlueData, ObjectDescriptor } from './index';

describe('GlueData', () => {
  it('works', () => {
    // ----------------------------------------------------------------
    // storage

    const storage = new Map<any, any>([
      ['root', { id: 'root', children: ['node-1', 'node-2'] }],
      ['node-1', { id: 'node-1', children: ['node-3'] }],
      ['node-2', { id: 'node-2' }],
      ['node-3', { id: 'node-3' }],
    ]);

    // ----------------------------------------------------------------
    // descriptors

    const layout: ObjectDescriptor = {
      describeProp(key) {
        if (key === 'children') return layoutChildren;
      },
    };

    const layoutChildren: ObjectDescriptor = {
      describeProp(key, value) {
        if (typeof key === 'string' && key !== 'length' && Number.isInteger(+key)) {
          return forwardTo(value);
        }
      },
      receiveValue(value, valueIsProxy, key) {
        // ignore weird keys, like "length"
        if (typeof key !== 'string' || !Number.isInteger(+key)) return value;

        // directly set a nodeId
        if (typeof value !== 'object' || !value) return value;

        // it is important to use `glueData.get`
        // not directly accessing `storage`

        const needNewId = storage.has(value.id) && (!valueIsProxy || storage.get(value.id) !== valueIsProxy.rawValue);
        if (needNewId) {
          value = {
            ...value,
            id: Math.random(),
          };
        }

        storage.set(value.id, value);
        return value.id;
      },
    };

    // ----------------------------------------------------------------
    // main

    const glueData = new GlueData({
      getNode: id => ({
        rawValue: storage.get(id),
        descriptor: layout,
      }),
    });

    type Layout = {
      id: string;
      children?: Layout[];
    };

    const root = glueData.get('root') as Layout;
    expect(root).toEqual({
      id: 'root',
      children: [
        {
          id: 'node-1',
          children: [{ id: 'node-3' }],
        },
        { id: 'node-2' },
      ],
    });

    // ----------------------------------------------------------------
    // main

    root.children!.push({ id: 'new-node-1' });
    root.children!.shift();

    expect(storage.has('new-node-1')).toBeTruthy();
    expect(root).toEqual({
      id: 'root',
      children: [{ id: 'node-2' }, { id: 'new-node-1' }],
    });
  });
});
