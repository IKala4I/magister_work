# -*- coding: utf-8 -*-
"""Реєстр формул (2.1)–(2.20) у LaTeX.

Це ДАНІ, а не код: кожен рядок набрано вручну з відповідного рядка full.md
(формула в джерелі — рядок, що закінчується «    (2.N)»). Якщо в джерелі змінюється
формула, її треба змінити і тут — складальник цього не побачить сам. Перевірка
verify.py ловить лише загублені кириличні слова, а не змінені індекси чи числа.

Рішення, погоджені з автором:
  * варіант B: індекси, записані в джерелі дужками, підняті в справжні позиції
    (λd → λ_d, Tкрит → T_крит, z(sw,k) → z_{sw,k}); аргументи функцій лишаються
    в дужках: w(τ,k), A(g), C(u), F(τ), T(g), H(g);
  * clip[0,1] — квадратні дужки на базовій лінії, НЕ підрядковий індекс;
  * |…| у (2.7) — потужність перетину напівінтервалів, а не модуль;
  * довгі формули 12 пт; ті, що не вміщаються й так, — розрив на два рядки 14 пт
    (FORMULA_SPLIT); номер завжди в окремій комірці праворуч.
"""

FORMULA_TEX = {
 '2.1':  r'A^{*} = \operatorname{argmax}_{A} \sum_{(\tau,s)\in A} P\left(\text{викон}(\tau,s) \mid x(u), x(\tau), x(s)\right) \cdot v(\tau) - \lambda \cdot \text{Cost}(A)',
 '2.2':  r'w(\tau,k) = v(\tau) \cdot \hat{q}(\tau, \varphi(k)) \cdot g(dl(\tau) - k)',
 '2.3':  r'\max \sum_{\tau\in T} \sum_{k\in F(\tau)} w(\tau,k)\cdot x(\tau,k) - \lambda_{d}\cdot\sum_{\tau\in T_{\text{крит}}} M(\tau)\cdot(1 - y(\tau)) - \lambda_{s}\cdot\sum_{k} z_{sw,k} - \lambda_{f}\cdot\sum_{\tau} z_{fr,\tau}',
 '2.4':  r'\sum_{k\in F(\tau)} x(\tau,k) = y(\tau) \le 1 \ \text{для всіх } \tau; \quad y(\tau) = 1 \ \text{для закріплених задач}',
 '2.5':  r'\sum_{\tau} \sum_{k^{\prime}\in F(\tau):\, k^{\prime} \le k < k^{\prime} + d(\tau) + b} x(\tau,k^{\prime}) \le 1 \ \text{для всіх } k \in W',
 '2.6':  r'\tau \rightarrow \{\tau^{(1)}, \ldots, \tau^{(m)}\}, \quad d(\tau^{(j)}) \ge d_{\min}, \quad \sum_{j} y(\tau^{(j)})\cdot d(\tau^{(j)}) \ge d(\tau)\cdot y(\tau) \quad \left(\text{усе або нічого через ланцюг фрагментів}\right)',
 '2.7':  r'\sum_{\tau\in T(g)} \sum_{k^{\prime}\in F(\tau)} \left| [k^{\prime},\, k^{\prime}+d(\tau)) \cap [k,\, k+L) \right| \cdot x(\tau,k^{\prime}) \le H(g) + z_{sw,k} \ \text{для всіх } k \ \text{та категорій } g',
 '2.8':  r'z_{fr,\tau} \ge (\text{кількість фрагментів } \tau) - 1 \ \text{для подільних } \tau',
 '2.9':  r'\tilde{\theta}(g) \sim N\left(\hat{\theta}(g), \sigma^{2}\cdot A(g)^{-1}\right); \quad \hat{q}(\tau,c) = \operatorname{clip}[0,1]\left( x(\tau,c)^{\mathsf{T}}\cdot\tilde{\theta}(g(\tau)) \right)',
 '2.10': r'\hat{q}(\tau,c) = \operatorname{clip}[0,1]\left( x^{\mathsf{T}}\hat{\theta}(g) + \alpha_{ucb} \cdot \sqrt{ x^{\mathsf{T}} A(g)^{-1} x } \right)',
 '2.11': r'\mu_{0}^{(g)}(c_{0}, p) = \sigma\left( \gamma_{g}\cdot\operatorname{logit}\left(\mu_{0}^{(\text{Deep})}(c_{0}, p)\right) + \delta_{g} + \delta_{g,p} \right)',
 '2.12': r'\alpha_{0} = n_{0} \cdot \mu_{0}^{(g)}; \quad \beta_{0} = n_{0} \cdot \left(1 - \mu_{0}^{(g)}\right)',
 '2.13': r'x(u) = \left( Y^{\mathsf{T}} C(u) Y + \lambda I \right)^{-1} \cdot Y^{\mathsf{T}} C(u)\, p(u)',
 '2.14': r'\hat{\alpha}_{0} = m\cdot\left( \frac{m(1-m)}{s^{2}} - 1 \right); \quad \hat{\beta}_{0} = (1-m)\cdot\left( \frac{m(1-m)}{s^{2}} - 1 \right)',
 '2.15': r'V(\pi) = E_{x\sim D}\, E_{a\sim\pi(\cdot\mid x)}\, E\left[\, r \mid x,a \,\right]',
 '2.16': r'\hat{V}_{\text{replay}}(\pi) = \frac{\sum_{i} 1[\pi(x_{i}) = a_{i}]\cdot r_{i}}{\sum_{i} 1[\pi(x_{i}) = a_{i}]}',
 '2.17': r'\hat{V}_{\text{IPS}}(\pi) = \frac{1}{n}\cdot\sum_{i} \omega_{i}\cdot r_{i}',
 '2.18': r'\hat{V}_{\text{clip}}(\pi) = \frac{1}{n}\cdot\sum_{i} \min(\omega_{i}, M)\cdot r_{i}; \quad \hat{V}_{\text{SNIPS}}(\pi) = \frac{\sum_{i} \omega_{i}\cdot r_{i}}{\sum_{i} \omega_{i}}',
 '2.19': r'\hat{V}_{\text{DR}}(\pi) = \frac{1}{n}\cdot\sum_{i} \left[\, \hat{r}(x_{i}, \pi(x_{i})) + \omega_{i}\cdot\left( r_{i} - \hat{r}(x_{i}, a_{i}) \right) \,\right]',
 '2.20': r'\mathrm{ESS} = \frac{\left( \sum_{i} \omega_{i} \right)^{2}}{\sum_{i} \omega_{i}^{2}}',
}

# Формули, які не вміщаються в 152 мм комірки навіть на 12 пт: два рядки, номер на другому.
FORMULA_SPLIT = {
 '2.3': (r'\max \sum_{\tau\in T} \sum_{k\in F(\tau)} w(\tau,k)\cdot x(\tau,k) - \lambda_{d}\cdot\sum_{\tau\in T_{\text{крит}}} M(\tau)\cdot(1 - y(\tau))',
         r'{} - \lambda_{s}\cdot\sum_{k} z_{sw,k} - \lambda_{f}\cdot\sum_{\tau} z_{fr,\tau}'),
 '2.7': (r'\sum_{\tau\in T(g)} \sum_{k^{\prime}\in F(\tau)} \left| [k^{\prime},\, k^{\prime}+d(\tau)) \cap [k,\, k+L) \right| \cdot x(\tau,k^{\prime}) \le H(g) + z_{sw,k}',
         r'\text{для всіх } k \ \text{та категорій } g'),
 '2.6': (r'\tau \rightarrow \{\tau^{(1)}, \ldots, \tau^{(m)}\}, \quad d(\tau^{(j)}) \ge d_{\min},',
         r'\sum_{j} y(\tau^{(j)})\cdot d(\tau^{(j)}) \ge d(\tau)\cdot y(\tau) \quad \left(\text{усе або нічого через ланцюг фрагментів}\right)'),
}

# Явні винятки кегля. Решта: 12 пт, якщо рядок джерела довший за 74 символи, інакше 14 пт.
FORMULA_PT = {'2.1': 12, '2.4': 12, '2.14': 12, '2.19': 12}

# Рядки keep-verbatim, які у .docx є структурою рівняння, а не текстом,
# і тому не можуть бути знайдені пошуком підрядка в тексті документа.
DOCX_EXEMPT = {'clip[0,1]', 'E(x~D)'}
