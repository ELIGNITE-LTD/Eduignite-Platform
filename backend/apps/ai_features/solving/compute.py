"""Arithmetic done by code, not by a language model.

Every wrong number a student saw came from the same place: the model was
asked to "check it a second way" and then did both the solving and the
checking in its head. Two mental calculations that disagree by 0.3% get
written up as "rounding", and the student reads a contradiction presented as
agreement.

So the model no longer does arithmetic. It writes expressions; this evaluates
them.

Nothing here runs `exec` or `eval` on model output. An expression is parsed by
sympy into a tree, and every node of that tree is checked against a whitelist
before it is evaluated. A name that is not a known symbol or a known function
is refused, which means a model that writes `__import__("os").system(...)`
gets an error rather than a shell. That matters more than usual here: the
expression comes from a model, and a model can be steered by whatever a
student pastes into it.
"""

from __future__ import annotations

import ast
import math
from dataclasses import dataclass, field
from typing import Any, Iterable

import sympy
from sympy.parsing.sympy_parser import parse_expr, standard_transformations

#: Functions an expression may call. Anything else is refused by name.
ALLOWED_FUNCTIONS = {
    'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
    'sinh', 'cosh', 'tanh',
    'exp', 'log', 'ln', 'sqrt', 'Abs', 'abs',
    'floor', 'ceiling', 'sign',
    'Min', 'Max', 'root', 'Pow', 'Add', 'Mul',
    'rad', 'deg', 'pi', 'E',
}

#: Constants an expression may name without defining.
CONSTANTS = {
    'pi': sympy.pi,
    'e': sympy.E,
    'E': sympy.E,
}

MAX_EXPRESSION_LENGTH = 400
MAX_SYMBOLS = 60
#: A guard against expressions like 9**9**9 that are small to write and
#: enormous to evaluate.
MAX_EXPONENT = 64


class ComputeError(ValueError):
    """An expression that cannot be trusted, and so is not evaluated."""


@dataclass
class Quantity:
    """One computed value: what it is, what it is worth, and in what unit.

    `value` is kept at full precision. Rounding happens once, at display, so
    that a figure quoted in the explanation and the same figure used in a
    later step can never drift apart.
    """

    name: str
    value: float
    unit: str = ''
    #: The expression it came from, kept so a reader can be shown the working.
    expression: str = ''
    #: Significant figures for display. None means "as the paper asked".
    significant_figures: int | None = None

    def rounded(self, significant_figures: int | None = None) -> float:
        figures = significant_figures or self.significant_figures
        if not figures or self.value == 0 or not math.isfinite(self.value):
            return self.value
        from decimal import Decimal
        digits = figures - int(math.floor(math.log10(abs(self.value)))) - 1
        return float(round(Decimal(repr(self.value)), digits))

    def display(self, significant_figures: int | None = None) -> str:
        value = self.rounded(significant_figures)
        text = f'{value:g}'
        return f'{text} {self.unit}'.strip()


@dataclass
class Computed:
    """Every number in one answer, in one place.

    No stage after this one may write a number of its own: the composer, the
    charts and the linter all read from here. That is what makes the
    consistency check possible at all.
    """

    quantities: dict[str, Quantity] = field(default_factory=dict)

    def add(self, quantity: Quantity) -> Quantity:
        self.quantities[quantity.name] = quantity
        return quantity

    def value(self, name: str) -> float:
        if name not in self.quantities:
            raise ComputeError(f'No computed value named {name!r}.')
        return self.quantities[name].value

    def __contains__(self, name: str) -> bool:
        return name in self.quantities

    def __getitem__(self, name: str) -> Quantity:
        return self.quantities[name]

    def as_dict(self) -> dict[str, Any]:
        return {
            name: {'value': q.value, 'unit': q.unit, 'expression': q.expression}
            for name, q in self.quantities.items()
        }


#: Node types an expression may be built from. Anything else is refused
#: before the string is handed to a parser.
_ALLOWED_AST_NODES = (
    ast.Expression, ast.BinOp, ast.UnaryOp, ast.Call, ast.Name, ast.Load,
    ast.Constant, ast.Tuple,
    ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Pow, ast.Mod, ast.FloorDiv,
    ast.USub, ast.UAdd,
)


def _check_source(text: str, allowed_names: Iterable[str]) -> None:
    """Vet the string before any parser touches it.

    This has to happen first, and the reason is worth stating plainly:
    sympy's parse_expr compiles the string and runs it. Handing it
    `eval("2+2")` returns 4, because the eval really ran. A whitelist applied
    to the parsed tree is therefore too late - by then anything the
    expression wanted to do has already happened.

    So the expression is first parsed by Python's own ast in expression mode,
    which builds a tree without executing anything, and every node is checked
    against the small set above. Only a string that survives this is given to
    sympy.
    """

    try:
        tree = ast.parse(text, mode='eval')
    except SyntaxError as exc:
        raise ComputeError(f'Could not read the expression: {exc.msg}') from exc

    allowed = set(allowed_names) | set(CONSTANTS)
    for node in ast.walk(tree):
        if not isinstance(node, _ALLOWED_AST_NODES):
            raise ComputeError(f'{type(node).__name__} is not allowed in an expression.')
        if isinstance(node, ast.Call):
            if not isinstance(node.func, ast.Name):
                raise ComputeError('Only plain function calls are allowed.')
            if node.func.id not in ALLOWED_FUNCTIONS:
                raise ComputeError(f'Function {node.func.id!r} is not allowed.')
            if node.keywords:
                raise ComputeError('Keyword arguments are not allowed.')
        elif isinstance(node, ast.Name):
            if node.id not in allowed and node.id not in ALLOWED_FUNCTIONS:
                raise ComputeError(f'Unknown symbol {node.id!r} in expression.')
        elif isinstance(node, ast.Constant):
            if not isinstance(node.value, (int, float)):
                raise ComputeError('Only numbers may appear as literals.')


def _check_tree(expr: sympy.Expr, allowed_names: Iterable[str]) -> None:
    """Refuse anything in the parsed tree that is not on the whitelist."""

    allowed = set(allowed_names) | set(CONSTANTS)
    for node in sympy.preorder_traversal(expr):
        if isinstance(node, sympy.Symbol):
            if node.name not in allowed:
                raise ComputeError(f'Unknown symbol {node.name!r} in expression.')
        elif isinstance(node, sympy.Function):
            name = type(node).__name__
            if name not in ALLOWED_FUNCTIONS:
                raise ComputeError(f'Function {name!r} is not allowed.')
        elif isinstance(node, sympy.Pow):
            exponent = node.args[1]
            if exponent.is_number and abs(float(exponent)) > MAX_EXPONENT:
                raise ComputeError('Exponent is too large to evaluate safely.')


def evaluate(expression: str, symbols: dict[str, float] | None = None) -> float:
    """Work out one expression, with named values substituted in.

    Raises ComputeError rather than returning something doubtful. A number
    that cannot be computed must stop the pipeline, not reach a student with a
    shrug.
    """

    text = (expression or '').strip()
    if not text:
        raise ComputeError('Empty expression.')
    if len(text) > MAX_EXPRESSION_LENGTH:
        raise ComputeError('Expression is too long.')
    if '__' in text or 'lambda' in text:
        raise ComputeError('Expression contains forbidden syntax.')

    values = dict(symbols or {})
    if len(values) > MAX_SYMBOLS:
        raise ComputeError('Too many symbols.')

    _check_source(text, values)

    try:
        parsed = parse_expr(
            text,
            local_dict={name: sympy.Symbol(name) for name in values} | dict(CONSTANTS),
            transformations=standard_transformations,
            evaluate=True,
        )
    except ComputeError:
        raise
    except Exception as exc:  # noqa: BLE001 - sympy raises many shapes
        raise ComputeError(f'Could not read the expression: {exc}') from exc

    _check_tree(parsed, values)

    try:
        substituted = sympy.sympify(parsed).subs(
            {sympy.Symbol(k): sympy.Float(v) for k, v in values.items()}
        )
    except Exception as exc:  # noqa: BLE001
        raise ComputeError(f'Could not substitute values: {exc}') from exc
    try:
        result = complex(sympy.N(substituted, 30))
    except Exception as exc:  # noqa: BLE001
        raise ComputeError(f'Could not evaluate the expression: {exc}') from exc

    if abs(result.imag) > 1e-9:
        raise ComputeError('Expression evaluated to a complex number.')
    value = float(result.real)
    if not math.isfinite(value):
        raise ComputeError('Expression evaluated to infinity or NaN.')
    return value


def compute_all(
    steps: list[dict[str, Any]],
    givens: dict[str, float] | None = None,
) -> Computed:
    """Evaluate an ordered list of steps, each able to use the ones before it.

    A step is {'name': 'T', 'expr': '2*u*sin(a)/g', 'unit': 's'}. Order
    matters: a step may only name quantities already computed, which also
    means a circular definition is an error rather than a hang.
    """

    computed = Computed()
    symbols: dict[str, float] = dict(givens or {})

    for name, value in symbols.items():
        computed.add(Quantity(name=name, value=float(value), unit='', expression='given'))

    for step in steps:
        name = str(step.get('name') or '').strip()
        expression = str(step.get('expr') or step.get('expression') or '').strip()
        if not name or not expression:
            raise ComputeError('Every step needs a name and an expression.')
        value = evaluate(expression, symbols)
        symbols[name] = value
        computed.add(
            Quantity(
                name=name,
                value=value,
                unit=str(step.get('unit') or ''),
                expression=expression,
                significant_figures=step.get('significant_figures'),
            )
        )

    return computed
