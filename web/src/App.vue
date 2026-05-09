<template>
  <el-container class="app-root">
    <el-header class="app-header">
      <div class="header-left">
        <span class="logo">遇见未来</span>
        <span class="subtitle">汇率预测 · 策略辅助</span>
      </div>
      <el-menu
        mode="horizontal"
        :router="true"
        :default-active="activeMenu"
        class="nav-menu"
      >
        <el-menu-item index="/overview">概览</el-menu-item>
        <el-menu-item index="/analysis">行情分析</el-menu-item>
        <el-menu-item index="/intelligence">情报站</el-menu-item>
        <el-menu-item index="/history">回顾</el-menu-item>
      </el-menu>
    </el-header>
    <el-main class="app-main">
      <router-view />
    </el-main>
  </el-container>
</template>

<script setup lang="ts">
import { computed } from "vue"
import { useRoute } from "vue-router"
const route = useRoute()
const activeMenu = computed(() => route.path)
</script>

<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: "PingFang SC", "Microsoft YaHei", sans-serif; background: #f8fafc; }
.app-root { min-height: 100vh; }
.app-header {
  display: flex;
  align-items: center;
  background: #fff;
  border-bottom: 1px solid #e2e8f0;
  padding: 0 24px;
  height: 56px !important;
  position: sticky;
  top: 0;
  z-index: 100;
}
.header-left { display: flex; align-items: center; gap: 12px; margin-right: 40px; }
.logo {
  font-size: 18px;
  font-weight: 700;
  background: linear-gradient(135deg, #2563eb, #7c3aed);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.subtitle { font-size: 11px; color: #64748b; }
.nav-menu { border-bottom: none !important; flex: 1; }
.nav-menu .el-menu-item {
  font-size: 13px;
  font-weight: 500;
  color: #475569;
  border-bottom: 2px solid transparent !important;
  transition: color 0.2s, border-color 0.2s;
}
.nav-menu .el-menu-item:hover { color: #2563eb; background: transparent !important; }
.nav-menu .el-menu-item.is-active {
  color: #2563eb !important;
  border-bottom-color: #2563eb !important;
  background: transparent !important;
}
.app-main { padding: 24px; }
</style>
