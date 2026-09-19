<template><button @click="inc">{{ n }}</button></template>
<script>
export default {
  data() {
    return { n: 0 };
  },
  methods: {
    inc() {
      this.n += 1;
    },
  },
};
</script>
