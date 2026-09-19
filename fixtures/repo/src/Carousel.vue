<template><div><slot /></div></template>
<script>
export default {
  data() {
    return { index: 0, timer: null };
  },
  mounted() {
    this.timer = setInterval(this.next, 4000);
  },
  beforeDestroy() {
    clearInterval(this.timer);
  },
  methods: {
    next() {
      this.index = (this.index + 1) % this.$slots.default.length;
    },
  },
};
</script>
