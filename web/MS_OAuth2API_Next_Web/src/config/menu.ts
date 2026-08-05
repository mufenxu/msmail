export interface MenuItem {
  index: string
  title: string
  routeName?: string
  disabled?: boolean
  children?: MenuItem[]
}

export const menuItems: MenuItem[] = [
  {
    index: '1',
    title: '控制台',
    routeName: 'home'
  }
]