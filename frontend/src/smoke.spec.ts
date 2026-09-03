import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';

describe('vitest + vue test utils wiring', () => {
  it('mounts a minimal component and reads its rendered text', () => {
    const Counter = defineComponent({
      template: '<button @click="count++">{{ count }}</button>',
      data: () => ({ count: 0 }),
    });
    const wrapper = mount(Counter);
    expect(wrapper.text()).toBe('0');
  });
});
