/**
 * SCOPE-124 / FR-007 — preflight judges content, not language or formatting.
 *
 * T010: `\bTODO\b` ran with the `i` flag, so it matched the Spanish word "todo" ("all", "every").
 *       A whole project could not file its scopes for writing its own language correctly
 *       (c9fc52d4).
 * T011: the actor label was rejected once emphasised, coupling validation to typography.
 * T013: the sweep for other English-only assumptions, including the reporter's unconfirmed claim
 *       that the plural form triggers the check too.
 */
import { describe, it, expect } from 'vitest';
import {
  runPreflight,
  matchesPlaceholder,
  findPlaceholders,
  extractActorValue,
  extractSectionContent,
  isMeasurableMetric,
} from '../src/index.js';

// [SCOPE 124 / T010] BEGIN — a complete scope written in Spanish
/**
 * Everything preflight requires, in Spanish. The section HEADINGS stay English because the
 * template that ships is English — see the T013 sweep: FR-007 is about prose, not structure.
 */
const SPANISH_SCOPE = `
## Overview

Este alcance describe un cambio real que resuelve un problema medible de los clientes, con un plan
de entrega concreto y responsables claramente identificados para todo el ciclo de trabajo.

## Business Problem

El equipo no puede registrar todo el historial de cambios de forma fiable, y todos los registros se
revisan a mano antes de cerrar el ciclo. Toda la informacion se pierde entre sistemas distintos.

## Actors

- Primary: Analista de operaciones que registra el trabajo diario
- Secondary: **Supervisor** del area, que revisa y aprueba los registros

## Success Metrics

1. Reducir el tiempo de registro en un 40% respecto al proceso actual
2. Procesar 500 registros diarios sin intervencion manual
3. Completar el cierre mensual en menos de 2 horas

## Scope Boundary

Incluye el registro, la revision y la aprobacion del trabajo diario dentro del sistema actual.

## Out of Scope

Excluye la facturacion, los informes historicos y cualquier integracion con sistemas externos.

## Open Questions

1. Ninguna pendiente.
`;
// [SCOPE 124 / T010] END

describe('SCOPE-124 T010 — a marker is a marker by how it is written, not which letters it contains', () => {
  it('lets ordinary Spanish prose through', () => {
    expect(matchesPlaceholder('El sistema debe registrar todo el historial de cambios.')).toEqual([]);
    expect(matchesPlaceholder('Toda la informacion queda disponible para el supervisor.')).toEqual([]);
    expect(matchesPlaceholder('Se revisa todo antes de cerrar.')).toEqual([]);
  });

  it('settles the reporter claim: the plural form never triggered it either', () => {
    // c9fc52d4 reported that both the singular and the plural trigger the check. Word-boundary
    // matching cannot match the plural — `\bTODO\b` stops at the trailing letter — so the plural
    // half of that report was imprecise. Pinned here so T013 does not have to re-derive it, and so
    // a future change that starts matching prefixes fails loudly.
    expect(matchesPlaceholder('Se revisan todos los registros antes de cerrar el ciclo.')).toEqual([]);
  });

  it('still blocks a real marker in caps', () => {
    expect(matchesPlaceholder('TODO: definir el alcance')).toEqual(['TODO']);
    expect(matchesPlaceholder('Esto es un TBD real')).toEqual(['TBD']);
    expect(matchesPlaceholder('> [NEEDS CLARIFICATION] data requirements missing')).toEqual([
      'NEEDS CLARIFICATION',
    ]);
  });

  it('does not treat a capitalised English word as a marker', () => {
    // "Todo" opening a sentence is prose in several languages; only the isolated uppercase token
    // is a marker.
    expect(matchesPlaceholder('Todo el equipo revisa el resultado.')).toEqual([]);
    expect(matchesPlaceholder('the todo list is maintained elsewhere')).toEqual([]);
  });

  it("keeps BUG-12's narrowing of the word placeholder", () => {
    expect(matchesPlaceholder('the URL still contains the placeholder string')).toEqual([]);
    expect(matchesPlaceholder('[placeholder]')).toEqual(['placeholder']);
    expect(matchesPlaceholder('placeholder: fill this in')).toEqual(['placeholder']);
  });

  it('reports where each marker is, not merely that one exists', () => {
    const doc = ['# Title', '', 'Some real prose here.', '', 'TODO: fill this in', ''].join('\n');
    const hits = findPlaceholders(doc);

    expect(hits).toHaveLength(1);
    expect(hits[0].marker).toBe('TODO');
    expect(hits[0].line).toBe(5);
    expect(hits[0].text).toBe('TODO: fill this in');
  });

  it('quotes the matched text and its location in the blocking issue', () => {
    const blocked = SPANISH_SCOPE.replace('Ninguna pendiente.', 'TODO: confirmar el alcance');
    const result = runPreflight(blocked);

    const issue = result.blockingIssues.find((i) => i.startsWith('Placeholder markers found'));
    expect(issue).toBeDefined();
    expect(issue).toContain('TODO at line');
    expect(issue).toContain('TODO: confirmar el alcance');
  });
});

describe('SCOPE-124 T011 — the label identifies the actor, the formatting does not', () => {
  const shapes: Array<[string, string]> = [
    ['plain', '- Secondary: Supervisor del area operativa'],
    ['emphasised name', '- Secondary: **Supervisor** del area operativa'],
    ['emphasised label', '- **Secondary**: Supervisor del area operativa'],
    ['both emphasised', '- **Secondary**: **Supervisor** del area operativa'],
    ['whole line emphasised', '**- Secondary: Supervisor del area operativa**'],
    ['italic label', '- *Secondary*: Supervisor del area operativa'],
    ['underscore label', '- _Secondary_: Supervisor del area operativa'],
    ['no bullet', 'Secondary: Supervisor del area operativa'],
  ];

  for (const [name, line] of shapes) {
    it(`recognises the secondary actor when written as: ${name}`, () => {
      const section = ['## Actors', '', '- Primary: Analista de operaciones', line, ''].join('\n');
      const actors = extractSectionContent(section, /^##?\s*Actors\b/i);
      expect(extractActorValue(actors, 'Secondary')).toContain('Supervisor');
    });
  }

  it('recognises an emphasised primary label too', () => {
    const section = ['## Actors', '', '- **Primary**: Analista de operaciones', ''].join('\n');
    const actors = extractSectionContent(section, /^##?\s*Actors\b/i);
    expect(extractActorValue(actors, 'Primary')).toBe('Analista de operaciones');
  });
});

describe('SCOPE-124 FR-007 — the headline: a Spanish scope passes', () => {
  it('scores the Spanish document as valid, with no blocking issues', () => {
    const result = runPreflight(SPANISH_SCOPE);

    expect(result.blockingIssues).toEqual([]);
    expect(result.isValid).toBe(true);
    expect(result.placeholdersFound).toEqual([]);
  });

  it('recognises its actors, metrics and boundaries', () => {
    const result = runPreflight(SPANISH_SCOPE);

    expect(result.minimumCriteriaStatus.primaryActor).toBe(true);
    expect(result.minimumCriteriaStatus.secondaryActors).toBe(true);
    expect(result.minimumCriteriaStatus.measurableSuccessMetrics).toBe(true);
    expect(result.minimumCriteriaStatus.businessProblem).toBe(true);
    expect(result.minimumCriteriaStatus.scopeBoundary).toBe(true);
    expect(result.minimumCriteriaStatus.outOfScope).toBe(true);
  });

  it('still blocks the same Spanish document once a real marker is added', () => {
    const blocked = SPANISH_SCOPE.replace('Ninguna pendiente.', 'TODO: confirmar el alcance');
    expect(runPreflight(blocked).isValid).toBe(false);
  });
});

describe('SCOPE-124 T013 — recorded findings from the English-only sweep', () => {
  it('measurable-metric detection is English-only in its keywords, so numbers carry a Spanish metric', () => {
    // Recorded, deliberately NOT changed: the keyword list (under, within, users, latency…) is
    // English, so a metric with no digits is held to a stricter bar in Spanish than in English.
    // Requiring a number is the right bar for a *measurable* metric whatever the language, and widening
    // the keyword list is product localisation — SCOPE-046, explicitly out of this scope.
    expect(isMeasurableMetric('Reducir el tiempo de registro en un 40%')).toBe(true);
    expect(isMeasurableMetric('Procesar 500 registros diarios')).toBe(true);
    expect(isMeasurableMetric('Mejorar la experiencia del usuario')).toBe(false);
    // The English equivalent with no digits passes only because of the keyword list:
    expect(isMeasurableMetric('Improve response time for every user')).toBe(true);
  });

  it('section headings and actor labels stay English — FR-007 is about prose, not structure', () => {
    // The template that ships is English, and every heading regex matches English. A scope whose
    // headings are translated is not recognised at all. That is the deliberate line this scope
    // draws: the STRUCTURE is English, the CONTENT need not be.
    const translated = SPANISH_SCOPE.replace('## Business Problem', '## Problema de Negocio');
    expect(runPreflight(translated).checks.hasBusinessProblem).toBe(true); // falls back to Overview
    const noOverview = translated.replace('## Overview', '## Resumen');
    expect(runPreflight(noOverview).checks.hasOverview).toBe(false);
  });
});
