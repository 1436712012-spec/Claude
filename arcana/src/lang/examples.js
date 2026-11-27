// The grimoire: example spells, each chosen because its call structure draws
// a different shape on stage (binary fractal, spiral, Pascal fan, ...).

export const EXAMPLES = [
  {
    id: 'fib',
    title: '斐波那契',
    shape: '二叉分形',
    blurb: '每个圆召唤两个更小的圆，整场施法长成一棵分形树。',
    code: `# 斐波那契：每一层召唤两个更小的法阵
spell fib(n) =
  if n < 2 then n
  else fib(n - 1) + fib(n - 2)

cast fib(7)`,
  },
  {
    id: 'hanoi',
    title: '汉诺塔',
    shape: '完美曼荼罗',
    blurb: '左右两次召唤完全对称，调用树是一棵满二叉树。',
    code: `# 汉诺塔：移动 n 个圆盘需要多少步？
spell hanoi(n) =
  if n == 0 then 0
  else hanoi(n - 1) + 1 + hanoi(n - 1)

cast hanoi(5)`,
  },
  {
    id: 'factorial',
    title: '阶乘',
    shape: '对数螺线',
    blurb: '单链递归，每次只召唤一个圆，排成一条向外舒展的螺线。',
    code: `# 阶乘：单链递归会卷成一条螺线
spell fact(n) =
  if n <= 1 then 1
  else n * fact(n - 1)

cast fact(12)`,
  },
  {
    id: 'collatz',
    title: '考拉兹猜想',
    shape: '长螺线',
    blurb: '从 27 出发要绕 111 步才回到 1，螺线因此拉得很长。',
    code: `# 考拉兹：偶数折半，奇数乘三加一，数一数几步回到 1
spell collatz(n) =
  if n == 1 then 0
  else 1 + collatz(if n % 2 == 0 then n / 2 else 3 * n + 1)

cast collatz(27)`,
  },
  {
    id: 'pascal',
    title: '帕斯卡三角',
    shape: '组合扇面',
    blurb: '二项式系数的递归定义，每次召唤都分出两条路径。',
    code: `# 组合数 C(n, k)：帕斯卡三角形的递归定义
spell C(n, k) =
  if k == 0 or k == n then 1
  else C(n - 1, k - 1) + C(n - 1, k)

cast C(6, 3)`,
  },
  {
    id: 'mutual',
    title: '奇偶互咒',
    shape: '双色螺线',
    blurb: '两个咒语轮流召唤彼此，螺线上两种印记交替出现。',
    code: `# 互递归：两个咒语轮流召唤彼此
spell even(n) = if n == 0 then true else odd(n - 1)
spell odd(n) = if n == 0 then false else even(n - 1)

cast even(9)`,
  },
  {
    id: 'ackermann',
    title: '阿克曼函数',
    shape: '嵌套风暴',
    blurb: '参数本身又是一次召唤，递归套着递归。',
    code: `# 阿克曼函数：参数里还藏着召唤
spell ack(m, n) =
  if m == 0 then n + 1
  else if n == 0 then ack(m - 1, 1)
  else ack(m - 1, ack(m, n - 1))

cast ack(2, 2)`,
  },
  {
    id: 'power',
    title: '快速幂',
    shape: '短螺线 · let',
    blurb: '用 let 把一次召唤的结果记下来复用，每层只召唤一次。',
    code: `# 快速幂：let 让一次召唤的结果被用两次
spell pow(b, e) =
  if e == 0 then 1
  else let h = pow(b, floor(e / 2)) in
    if e % 2 == 0 then h * h else h * h * b

cast pow(3, 13)`,
  },
  {
    id: 'gcd',
    title: '欧几里得',
    shape: '收敛螺线',
    blurb: '两千年前的辗转相除法，几步就收敛。',
    code: `# 欧几里得算法：辗转相除
spell gcd(a, b) =
  if b == 0 then a
  else gcd(b, a % b)

cast gcd(1071, 462)`,
  },
  {
    id: 'prime',
    title: '素数试除',
    shape: '短路求值',
    blurb: 'and 的短路让右侧分支保持黯淡，只有需要时才点亮。',
    code: `# 素数检验：and 短路时，右侧的分支保持黯淡
spell prime(n) = n >= 2 and sieve(n, 2)
spell sieve(n, d) =
  if d * d > n then true
  else if n % d == 0 then false
  else sieve(n, d + 1)

cast prime(97)`,
  },
  {
    id: 'newton',
    title: '牛顿开方',
    shape: '小数收敛',
    blurb: '用切线一步步逼近根号二，数值越来越精确。',
    code: `# 牛顿法逼近 √2：每一步都更接近答案
spell newton(x, g, i) =
  if i == 0 then g
  else newton(x, (g + x / g) / 2, i - 1)

cast newton(2, 1, 6)`,
  },
  {
    id: 'hanzi',
    title: '中文咒文',
    shape: '汉字关键字',
    blurb: '咒、施、若、则、否则：同一门语言，用中文书写。',
    code: `# 关键字可以用汉字书写：咒 施 若 则 否则 令 于 且 或 非
咒 斐波(数) = 若 数 < 2 则 数 否则 斐波(数 - 1) + 斐波(数 - 2)

施 斐波(6)`,
  },
  {
    id: 'crack',
    title: '裂阵',
    shape: '运行时错误',
    blurb: '倒数到 0 时会除以零，看看法阵在哪里裂开。',
    code: `# 倒数到 0 时会除以零，法阵会在出错的节点裂开
spell countdown(n) = 10 / n + countdown(n - 1)

cast countdown(4)`,
  },
];

export const DEFAULT_EXAMPLE = 'fib';
