# Model assumptions

V1 implements **no physical model**. There is no plasma density, electron temperature, pressure, temperature, flow or film
growth computation anywhere in the code. Everything visible is either:

- assumed geometry (see `docs/geometry-assumptions.md`), or
- illustrative visualization (`render_source = "illustrative"`): the plasma volume shader, the scripted ignition/extinction sequence, the gas path arrows and the sheath concept rings.

## Boundary for later physics

`PhysicsAdapter` (planned, backend): `initialize(config, initialConditions)`, typed inputs (name/quantity/unit/range/causality),
`advance(toSimTime)`, outputs with `source` and `model_version`, `reset/dispose`, declared capabilities (checkpoint, restore,
multi-instance). First implementation may be a Python lumped pressure + first-order response model (timestep candidate 0.1 s);
later candidates are MATLAB Engine API for Python or Simulink FMU exports, each verified for release/OS/runtime compatibility
before use. One model owns each physical state; visual effects never feed back into model inputs or sensor values.
Quantities a model does not provide (plasma density, electron temperature, spatial gas fields, film thickness) are never
faked as adapter outputs.
