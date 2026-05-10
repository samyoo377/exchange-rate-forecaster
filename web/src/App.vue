<template>
  <el-container class="app-root">
    <el-header class="app-header">
      <div class="header-left">
        <div class="logo-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M3 17L9 11L13 15L21 7" stroke="url(#grad)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M15 7H21V13" stroke="url(#grad)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
            <defs><linearGradient id="grad" x1="3" y1="7" x2="21" y2="17"><stop stop-color="#2563eb"/><stop offset="1" stop-color="#7c3aed"/></linearGradient></defs>
          </svg>
        </div>
        <div class="logo-text">
          <span class="logo">遇见未来</span>
          <span class="subtitle">汇率预测 · 策略辅助</span>
        </div>
      </div>
      <el-menu
        mode="horizontal"
        :router="true"
        :default-active="activeMenu"
        class="nav-menu"
      >
        <el-menu-item index="/overview">
          <el-icon><Odometer /></el-icon>
          <span>概览</span>
        </el-menu-item>
        <el-menu-item index="/analysis">
          <el-icon><TrendCharts /></el-icon>
          <span>行情分析</span>
        </el-menu-item>
        <el-menu-item index="/intelligence">
          <el-icon><Compass /></el-icon>
          <span>情报站</span>
        </el-menu-item>
        <el-menu-item index="/history">
          <el-icon><Clock /></el-icon>
          <span>回顾</span>
        </el-menu-item>
      </el-menu>
    </el-header>
    <el-main class="app-main">
      <router-view v-slot="{ Component }">
        <transition name="page-fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </el-main>
  </el-container>
</template>

<script setup lang="ts">
import { computed } from "vue"
import { useRoute } from "vue-router"
import { Odometer, TrendCharts, Compass, Clock } from "@element-plus/icons-vue"
const route = useRoute()
const activeMenu = computed(() => route.path)
</script>

<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: "PingFang SC", "Microsoft YaHei", -apple-system, sans-serif; background: #f5f7fa; }
.app-root { min-height: 100vh; }
.app-header {
  display: flex;
  align-items: center;
  background: #fff;
  border-bottom: 1px solid #edf2f7;
  padding: 0 32px;
  height: 60px !important;
  position: sticky;
  top: 0;
  z-index: 100;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}
.header-left { display: flex; align-items: center; gap: 10px; margin-right: 48px; }
.logo-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: linear-gradient(135deg, rgba(37,99,235,0.08), rgba(124,58,237,0.08));
}
.logo-text { display: flex; flex-direction: column; gap: 1px; }
.logo {
  font-size: 16px;
  font-weight: 700;
  background: linear-gradient(135deg, #2563eb, #7c3aed);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  line-height: 1.2;
}
.subtitle { font-size: 10px; color: #94a3b8; letter-spacing: 0.5px; }
.nav-menu { border-bottom: none !important; flex: 1; }
.nav-menu .el-menu-item {
  font-size: 13px;
  font-weight: 500;
  color: #64748b;
  border-bottom: 2px solid transparent !important;
  transition: all 0.2s ease;
  gap: 4px;
}
.nav-menu .el-menu-item:hover { color: #2563eb; background: rgba(37,99,235,0.04) !important; }
.nav-menu .el-menu-item.is-active {
  color: #2563eb !important;
  border-bottom-color: #2563eb !important;
  background: rgba(37,99,235,0.04) !important;
}
.app-main { padding: 28px 32px; max-width: 1400px; margin: 0 auto; width: 100%; }

.page-fade-enter-active,
.page-fade-leave-active {
  transition: opacity 0.15s ease;
}
.page-fade-enter-from,
.page-fade-leave-to {
  opacity: 0;
}
</style>
