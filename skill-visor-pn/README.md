# Skill: visor-pn — Para Claude Code

Skill que le da a Claude Code todo el contexto del proyecto **Visor de Planos y Fotos por P/N**: arquitectura, reglas, convenciones de código, decisiones de diseño y plan para extensiones.

## Cómo instalarla en Claude Code

Hay dos formas:

### 1. Skill del proyecto (recomendado)

Pega la carpeta `visor-pn` dentro de tu proyecto, en:

```
visor-pn/                       ← tu proyecto Node
├── server.js
├── public/
└── .claude/
    └── skills/
        └── visor-pn/           ← esta skill
            ├── SKILL.md
            └── references/
```

Claude Code la cargará automáticamente cuando trabajes en ese repo.

### 2. Skill global

Para tenerla disponible en cualquier sesión:

```
~/.claude/skills/visor-pn/
├── SKILL.md
└── references/
```

(En Windows: `C:\Users\<tu-usuario>\.claude\skills\visor-pn\`)

## Cómo activarla

Una vez instalada, simplemente pídele a Claude Code cosas como:

- "Agrega al visor de P/N un filtro por categoría"
- "El reindex está lento, métele watcher"
- "Soporta archivos DWG nativos"
- "Convierte el server en servicio de Windows"

La skill se activa sola y Claude ya sabrá el contexto del proyecto, las reglas (no escribir al NAS, sin build step, etc.) y a qué archivo ir.

## Qué contiene

- `SKILL.md` — Reglas innegociables, convenciones, flujo de cambios.
- `references/decisiones.md` — Por qué está hecho así.
- `references/extensiones.md` — Plan para features futuras.
- `references/prueba-local.md` — Cómo probar sin estar conectado al NAS.
- `references/despliegue.md` — PM2, NSSM, firewall, servicio Windows.

Claude lee `SKILL.md` siempre que la skill se active. Las referencias las abre solo cuando son relevantes para la tarea, así no consume contexto de más.
