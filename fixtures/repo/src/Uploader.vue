<template><input type="file" @change="upload"></template>
<script>
export default {
  data() {
    return { progress: 0 };
  },
  methods: {
    async upload(e) {
      const file = e.target.files[0];
      this.$emit("start", file);
      await this.$root.$api.upload(file, (p) => {
        this.progress = p;
      });
    },
  },
};
</script>
