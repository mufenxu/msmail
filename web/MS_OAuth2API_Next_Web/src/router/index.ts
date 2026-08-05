import { createRouter, createWebHistory } from 'vue-router'

import LayoutView from '@/views/layout/index.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'index',
      component: LayoutView,
      redirect: '/email',
      children: [
        {
          path: '/home',
          name: 'home',
          redirect: '/email',
        },
        {
          path: '/email',
          name: 'email',
          component: () => import('@/views/email/index.vue'),
        },
      ],
    },
  ],
})

export default router
