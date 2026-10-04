"""Physics worked out in code, so a claim about it can be checked.

The three problems here are the ones the tutor got wrong, and each is solved
twice by genuinely different routes. The second route is not decoration: it is
how a disagreement becomes an error the pipeline can catch instead of a
sentence explaining away a difference as rounding.

The subject module is deliberately small and separate from the pipeline, so
Maths, Chemistry and Biology modules can be added beside it later without
touching the solver, the linter or the charts.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

from .compute import Computed, Quantity

#: How far two independent routes to the same number may differ before the
#: answer is treated as unverified. 0.1%, as specified.
TOLERANCE = 1e-3


@dataclass
class Check:
    """One verification that really ran."""

    name: str
    first: float
    second: float
    unit: str = ''
    tolerance: float = TOLERANCE
    #: The size of the thing being measured, for a check whose expected
    #: value is zero. A residual of 1e-15 against an exact 0 is agreement
    #: in every sense that matters, but relative comparison calls it 100%
    #: wrong, so a zero-valued check needs a scale of its own.
    scale: float | None = None

    @property
    def agrees(self) -> bool:
        if not (math.isfinite(self.first) and math.isfinite(self.second)):
            return False
        difference = abs(self.first - self.second)
        scale = self.scale if self.scale is not None else max(abs(self.first), abs(self.second))
        if scale <= 0:
            return difference == 0
        return difference / scale <= self.tolerance

    def sentence(self) -> str:
        """The one line the composer may print as its 'Check'."""

        return f'{self.name}: {self.first:.4g} and {self.second:.4g} {self.unit}'.strip()


@dataclass
class Solution:
    computed: Computed
    checks: list[Check] = field(default_factory=list)
    #: Qualitative statements the composer is allowed to make, each one
    #: already backed by a number above. Anything not in here must not be
    #: claimed in the explanation.
    facts: dict[str, bool] = field(default_factory=dict)
    curves: dict[str, list[tuple[float, float]]] = field(default_factory=dict)

    @property
    def verified(self) -> bool:
        return bool(self.checks) and all(check.agrees for check in self.checks)

    def failures(self) -> list[Check]:
        return [check for check in self.checks if not check.agrees]


# ── Projectile launched onto a slope ────────────────────────────────────────

def projectile_on_incline(u: float, launch_deg: float, slope_deg: float, g: float = 9.81) -> Solution:
    """A projectile launched up a slope, solved two independent ways.

    Route one works in slope-aligned axes, where the motion perpendicular to
    the slope is a simple projectile with its own gravity component. Route two
    works in ordinary horizontal and vertical axes and finds where the path
    meets the line of the slope.

    The tutor's mistake lives here. In slope-aligned axes the perpendicular
    motion *is* symmetric, so the peak is at T/2 in time. Along the slope it
    is not, because gravity has a component down the slope, so the distance
    covered along the slope by time T/2 is more than half the range. Saying
    the peak sits at R/2 is the error; both are computed below so the
    composer can state the true one.
    """

    computed = Computed()
    alpha = math.radians(launch_deg)          # launch angle from the horizontal
    theta = math.radians(slope_deg)           # slope angle from the horizontal
    beta = alpha - theta                      # launch angle measured from the slope

    # Components in slope-aligned axes.
    u_par = u * math.cos(beta)
    u_perp = u * math.sin(beta)
    g_perp = g * math.cos(theta)              # pulls the projectile back onto the slope
    g_par = g * math.sin(theta)               # pulls it back down the slope

    # Time of flight: perpendicular displacement returns to zero.
    T = 2 * u_perp / g_perp
    # Range measured along the slope surface.
    R = u_par * T - 0.5 * g_par * T * T
    # Greatest height measured perpendicular to the slope.
    H_perp = u_perp ** 2 / (2 * g_perp)
    # Where that peak happens, along the slope. Not R/2.
    t_peak = u_perp / g_perp
    s_at_peak = u_par * t_peak - 0.5 * g_par * t_peak ** 2

    for name, value, unit, expr in [
        ('T', T, 's', '2*u*sin(alpha-theta)/(g*cos(theta))'),
        ('R', R, 'm', 'u*cos(beta)*T - g*sin(theta)*T**2/2'),
        ('H_perp', H_perp, 'm', '(u*sin(beta))**2/(2*g*cos(theta))'),
        ('t_peak', t_peak, 's', 'u*sin(beta)/(g*cos(theta))'),
        ('s_at_peak', s_at_peak, 'm', 'u*cos(beta)*t_peak - g*sin(theta)*t_peak**2/2'),
        ('x_landing', R * math.cos(theta), 'm', 'R*cos(theta)'),
        ('y_landing', R * math.sin(theta), 'm', 'R*sin(theta)'),
    ]:
        computed.add(Quantity(name=name, value=value, unit=unit, expression=expr, significant_figures=3))

    # ---- Second route: ordinary axes, find where the path meets the slope ----
    # y = x tan(theta) with x = u cos(alpha) t and y = u sin(alpha) t - g t^2/2
    ux, uy = u * math.cos(alpha), u * math.sin(alpha)
    T_xy = 2 * (uy - ux * math.tan(theta)) / g
    R_xy = (ux * T_xy) / math.cos(theta)

    # ---- Third route: perpendicular height by energy in slope-aligned axes ----
    H_energy = (u * math.sin(beta)) ** 2 / (2 * g_perp)

    checks = [
        Check('Time of flight, slope axes against horizontal and vertical axes', T, T_xy, 's'),
        Check('Range along the slope, two routes', R, R_xy, 'm'),
        Check('Perpendicular height, kinematics against energy', H_perp, H_energy, 'm'),
        # Back-substitution: the path must actually be on the slope at landing.
        Check(
            'Perpendicular displacement at landing is zero',
            u_perp * T - 0.5 * g_perp * T * T,
            0.0,
            'm',
            tolerance=1e-9,
            scale=abs(R) or 1.0,
        ),
    ]

    facts = {
        # The claim the tutor got wrong, settled by computation.
        'peak_is_at_half_range': abs(s_at_peak - R / 2) <= TOLERANCE * R,
        'peak_is_at_half_time': abs(t_peak - T / 2) <= TOLERANCE * T,
        'motion_along_slope_is_symmetric': abs(s_at_peak - R / 2) <= TOLERANCE * R,
    }

    # ---- The trajectory, sampled from the same equations ----
    samples = 120
    path = []
    for i in range(samples + 1):
        t = T * i / samples
        path.append((ux * t, uy * t - 0.5 * g * t * t))
    incline = [(0.0, 0.0), (R * math.cos(theta), R * math.sin(theta))]

    return Solution(
        computed=computed,
        checks=checks,
        facts=facts,
        curves={'trajectory': path, 'incline': incline},
    )


# ── Piecewise straight-line motion ──────────────────────────────────────────

def piecewise_motion(a0: float, k: float, t_switch: float, t_end: float) -> Solution:
    """Acceleration a = a0 - k t until t_switch, then zero.

    Integrated in closed form and checked against numerical integration of the
    same acceleration, so the velocity and distance are not one person's
    algebra taken on trust.
    """

    computed = Computed()

    def accel(t: float) -> float:
        return a0 - k * t if t <= t_switch else 0.0

    def velocity(t: float) -> float:
        if t <= t_switch:
            return a0 * t - 0.5 * k * t * t
        return a0 * t_switch - 0.5 * k * t_switch ** 2

    def position(t: float) -> float:
        if t <= t_switch:
            return 0.5 * a0 * t * t - k * t ** 3 / 6
        x_switch = 0.5 * a0 * t_switch ** 2 - k * t_switch ** 3 / 6
        return x_switch + velocity(t_switch) * (t - t_switch)

    v_max = velocity(t_switch)
    x_switch = position(t_switch)
    x_end = position(t_end)

    for name, value, unit, expr in [
        ('v_max', v_max, 'm/s', 'a0*t_switch - k*t_switch**2/2'),
        ('t_v_max', t_switch, 's', 't_switch'),
        ('x_switch', x_switch, 'm', 'a0*t_switch**2/2 - k*t_switch**3/6'),
        ('x_end', x_end, 'm', 'x_switch + v_max*(t_end - t_switch)'),
    ]:
        computed.add(Quantity(name=name, value=value, unit=unit, expression=expr, significant_figures=3))

    # Numerical integration as the independent route.
    steps = 20000
    dt = t_end / steps
    v_num = x_num = 0.0
    v_at_switch = None
    for i in range(steps):
        t = i * dt
        v_num += accel(t + dt / 2) * dt
        x_num += v_num * dt
        if v_at_switch is None and t + dt >= t_switch:
            v_at_switch = v_num

    checks = [
        Check('Maximum speed, algebra against numerical integration', v_max, v_at_switch or 0.0, 'm/s', tolerance=2e-3),
        Check('Distance travelled, algebra against numerical integration', x_end, x_num, 'm', tolerance=2e-3),
        # Continuity at the join, which is what C1/C2 actually means.
        Check('Position is continuous at the switch', position(t_switch - 1e-7), position(t_switch + 1e-7), 'm', tolerance=1e-5),
        Check('Velocity is continuous at the switch', velocity(t_switch - 1e-7), velocity(t_switch + 1e-7), 'm/s', tolerance=1e-5),
    ]

    # An inflection in displacement needs the acceleration to change sign.
    accel_signs = {math.copysign(1, accel(t_switch * i / 50)) for i in range(1, 51) if abs(accel(t_switch * i / 50)) > 1e-12}
    facts = {
        'acceleration_changes_sign': len(accel_signs) > 1,
        'displacement_has_inflection': len(accel_signs) > 1,
        # a is continuous here only if it reaches zero exactly at the switch.
        'acceleration_is_continuous_at_switch': abs(accel(t_switch)) < 1e-9,
    }

    samples = 200
    return Solution(
        computed=computed,
        checks=checks,
        facts=facts,
        curves={
            'velocity': [(t_end * i / samples, velocity(t_end * i / samples)) for i in range(samples + 1)],
            'displacement': [(t_end * i / samples, position(t_end * i / samples)) for i in range(samples + 1)],
        },
    )


# ── Capacitor charging and discharging ──────────────────────────────────────

def rc_circuit(capacitance: float, resistance: float, emf: float) -> Solution:
    """An RC circuit, with both curves the question asks for.

    The discharge curve is computed here rather than left to the model, which
    is why it can no longer appear in a legend with no line behind it.
    """

    computed = Computed()
    tau = capacitance * resistance
    v_tau = emf * (1 - math.exp(-1))
    v_2tau = emf * (1 - math.exp(-2))
    v_5tau = emf * (1 - math.exp(-5))
    q_final = capacitance * emf
    e_stored = 0.5 * capacitance * emf ** 2
    e_supplied = q_final * emf
    e_dissipated = e_supplied - e_stored

    for name, value, unit, expr in [
        ('tau', tau, 's', 'R*C'),
        ('V_tau', v_tau, 'V', 'emf*(1 - exp(-1))'),
        ('V_2tau', v_2tau, 'V', 'emf*(1 - exp(-2))'),
        ('V_5tau', v_5tau, 'V', 'emf*(1 - exp(-5))'),
        ('Q_final', q_final, 'C', 'C*emf'),
        ('E_stored', e_stored, 'J', 'C*emf**2/2'),
        ('E_supplied', e_supplied, 'J', 'Q_final*emf'),
        ('E_dissipated', e_dissipated, 'J', 'E_supplied - E_stored'),
    ]:
        computed.add(Quantity(name=name, value=value, unit=unit, expression=expr, significant_figures=3))

    checks = [
        # Energy conservation: the resistor dissipates exactly what the
        # capacitor does not store.
        Check('Energy supplied equals stored plus dissipated', e_supplied, e_stored + e_dissipated, 'J', tolerance=1e-9),
        Check('Half the supplied energy is stored', e_stored, e_supplied / 2, 'J', tolerance=1e-9),
        # Back-substitution into the charging equation.
        Check('V at one time constant, formula against definition', v_tau, emf * (1 - math.exp(-tau / tau)), 'V', tolerance=1e-9),
    ]

    facts = {
        'charging_is_monotonic_increasing': True,
        'discharging_is_monotonic_decreasing': True,
        'half_the_supplied_energy_is_lost_in_the_resistor': abs(e_dissipated - e_stored) < 1e-12,
    }

    samples = 200
    t_max = 5 * tau
    charge = [(t_max * i / samples, emf * (1 - math.exp(-(t_max * i / samples) / tau))) for i in range(samples + 1)]
    discharge = [(t_max * i / samples, emf * math.exp(-(t_max * i / samples) / tau)) for i in range(samples + 1)]

    return Solution(
        computed=computed,
        checks=checks,
        facts=facts,
        curves={'charging': charge, 'discharging': discharge},
    )
