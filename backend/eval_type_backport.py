from __future__ import annotations

import ast
import typing


class _UnionBackportTransformer(ast.NodeTransformer):
    def visit_BinOp(self, node):  # noqa: N802 - ast API
        node = self.generic_visit(node)
        if isinstance(node, ast.BinOp) and isinstance(node.op, ast.BitOr):
            parts = self._flatten_union(node)
            return ast.Subscript(
                value=ast.Attribute(value=ast.Name(id="typing", ctx=ast.Load()), attr="Union", ctx=ast.Load()),
                slice=ast.Tuple(elts=parts, ctx=ast.Load()),
                ctx=ast.Load(),
            )
        return node

    def _flatten_union(self, node: ast.AST) -> list[ast.AST]:
        if isinstance(node, ast.BinOp) and isinstance(node.op, ast.BitOr):
            return self._flatten_union(node.left) + self._flatten_union(node.right)
        return [node]


def _transform_expr(expr: str) -> str:
    tree = ast.parse(expr, mode="eval")
    tree = _UnionBackportTransformer().visit(tree)
    ast.fix_missing_locations(tree)
    return ast.unparse(tree)


def eval_type_backport(value, globalns=None, localns=None, try_default=False):  # signature expected by pydantic
    globalns = dict(globalns or {})
    localns = dict(localns or {})
    globalns.setdefault("typing", typing)
    localns.setdefault("typing", typing)

    if isinstance(value, typing.ForwardRef):
        expr = value.__forward_arg__
    elif isinstance(value, str):
        expr = value
    else:
        return value

    transformed = _transform_expr(expr)
    return eval(transformed, globalns, localns)

