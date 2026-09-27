"""Validate contracts, references and local sample provenance.

Optionally validate another analysis: python scripts/validate_foundation.py --analysis result.json
"""
from pathlib import Path
from hashlib import sha256
from datetime import datetime
import argparse
import json
import math
import os
import re
import zipfile

from jsonschema import Draft202012Validator, FormatChecker

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def require(condition, message):
    if not condition:
        raise ValueError(message)


def unique(values, label):
    require(len(values) == len(set(values)), f'Duplicate {label}')


def validate_analysis(data, schema, dictionary):
    Draft202012Validator(schema, format_checker=FormatChecker()).validate(data)
    ids = [s['id'] for s in data['source_refs']]
    unique(ids, 'source ID')
    sources = {s['id']: s for s in data['source_refs']}

    def refs(values):
        require(all(v in sources for v in values), f'Unresolved evidence/source references: {values}')

    elapsed = data['summary']['elapsed_duration_s']['value']
    active = data['summary']['active_duration_s']['value']
    if active is not None and elapsed is not None:
        require(active <= elapsed, 'Active duration exceeds elapsed duration')

    def interval(value, positive=False):
        if value is None:
            return
        start, end = value['start_elapsed_s'], value['end_elapsed_s']
        require(end > start if positive else end >= start, 'Invalid interval ordering')
        require(elapsed is not None, 'Cannot verify interval without elapsed duration')
        require(end <= elapsed, 'Interval exceeds session duration')

    for metric in data['summary'].values():
        refs(metric['source_refs'])
    durations = [w['duration_s'] for w in data['best_windows']]
    require(sorted(durations) == [300, 600, 1200], 'Need exactly one 5/10/20-minute window')
    for window in data['best_windows']:
        refs(window['source_refs'])
        if window['status'] == 'located':
            interval(window, positive=True)
            require(math.isclose(window['end_elapsed_s'] - window['start_elapsed_s'],
                                 window['duration_s'], abs_tol=0.001, rel_tol=0), 'Window duration mismatch')
    unique([c['observation_id'] for c in data['conditions']], 'condition ID')
    for condition in data['conditions']:
        refs(condition['source_refs'])
        if condition['kind'] == 'timestamped':
            require(condition['observed_at_utc'] is not None, 'Timestamped condition has no timestamp')
        else:
            require(condition['observed_at_utc'] is None, 'Daily summary must not fabricate observation time')
            require(condition['wind_mps'] is None and condition['wind_from_deg'] is None,
                    'Daily-summary wind cannot stand in for session-time wind')
    unique([e['event_id'] for e in data['events']], 'event ID')
    for event in data['events']:
        refs(event['source_refs'])
        interval(event['interval'])
        require((event['interval'] is None) == (event['timing_quality'] == 'unknown'),
                'Unknown timing requires a null interval; known timing requires an interval')
    issue_ids = {i['id'] for i in dictionary['issues']}
    unique([o['observation_id'] for o in data['technique_observations']], 'technique observation ID')
    for observation in data['technique_observations']:
        require(observation['issue_id'] in issue_ids, 'Unknown technique issue ID')
        refs(observation['evidence_refs'])
        interval(observation['interval'])
        kinds = {sources[r]['kind'] for r in observation['evidence_refs']}
        if observation['status'] == 'observed':
            require(bool(kinds & {'video', 'coach_observation'}), 'Observed technique needs direct evidence')
        if observation['status'] == 'athlete_reported':
            require('athlete_report' in kinds, 'Athlete report needs an athlete-report source')
        if observation['status'] == 'hypothesis':
            require(bool(observation['alternative_explanations']), 'Hypothesis requires alternatives')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--analysis', type=Path)
    args = parser.parse_args()
    schema = read(ROOT / 'schemas/analysis.schema.json')
    Draft202012Validator.check_schema(schema)
    dictionary = read(ROOT / 'data/reference/technique-issues.json')
    unique([i['id'] for i in dictionary['issues']], 'dictionary issue ID')
    source_ids = {s['id'] for s in dictionary['sources']}
    for issue in dictionary['issues']:
        require(set(issue['source_ids']) <= source_ids, 'Unresolved dictionary research source')
        require(issue['watch_only_confirmation'] is False, 'Watch-only confirmation is disallowed')
    schema_ids = set(schema['properties']['technique_observations']['items']['properties']['issue_id']['enum'])
    require(schema_ids == {i['id'] for i in dictionary['issues']}, 'Dictionary/schema IDs differ')
    example = read(args.analysis if args.analysis else ROOT / 'data/fixtures/analysis-example.json')
    validate_analysis(example, schema, dictionary)
    if args.analysis:
        print('Analysis JSON and semantic checks passed. Human evidence review is still required.')
        return

    manifest = read(ROOT / 'data/samples/garmin/manifest.json')
    inventory = read(ROOT / 'data/derived/fit-inventory.json')
    decoded = {s['session_id']: s for s in inventory['samples']}
    for sample in manifest['samples']:
        for kind in ('archive', 'fit'):
            path = ROOT / sample[kind]
            require(path.stat().st_size == sample[f'{kind}_bytes'], f'{kind} size mismatch')
            require(sha256(path.read_bytes()).hexdigest() == sample[f'{kind}_sha256'], f'{kind} hash mismatch')
        with zipfile.ZipFile(ROOT / sample['archive']) as archive:
            require(archive.testzip() is None, 'ZIP CRC failed')
            require(archive.read(Path(sample['fit']).name) == (ROOT / sample['fit']).read_bytes(),
                    'Extracted FIT does not match archive')
        report = decoded[sample['session_id']]
        require(report['zip_crc_ok'] and report['fit_crc_ok'], 'Recorded integrity result failed')
        require(report['fit_sha256'] == sample['fit_sha256'], 'Inventory is stale')
        track = read(ROOT / f"data/derived/{sample['session_id']}-track.json")
        require(track['source_fit_sha256'] == sample['fit_sha256'], 'Track is stale')
        require(len(track['records']) == report['record_count'], 'Track record count mismatch')
        start = datetime.fromisoformat(track['start_time_utc'])
        previous = -1
        for point in track['records']:
            elapsed = point['elapsed_s']
            require(elapsed >= previous, 'Track timestamps are not ordered')
            require(math.isclose((datetime.fromisoformat(point['timestamp_utc']) - start).total_seconds(),
                                 elapsed, abs_tol=0.001), 'Track elapsed-time conversion mismatch')
            previous = elapsed
            lat, lon = point['latitude_deg'], point['longitude_deg']
            require(lat is None or -90 <= lat <= 90, 'Latitude out of range')
            require(lon is None or -180 <= lon <= 180, 'Longitude out of range')

    session_ids = {s['session_id'] for s in manifest['samples']}
    require(example['session_id'] in session_ids, 'Example does not match a supplied activity')

    checked = 0
    excluded = {'.tools', '.git', 'node_modules', '.venv', 'dist', 'build'}
    for directory, subdirs, files in os.walk(ROOT):
        subdirs[:] = [name for name in subdirs if name not in excluded]
        for name in files:
            if not name.endswith('.md'):
                continue
            path = Path(directory) / name
            checked += 1
            for target in re.findall(r'\[[^\]]+\]\(([^)]+)\)', path.read_text(encoding='utf-8')):
                if re.match(r'^[a-z]+://', target) or target.startswith('#'):
                    continue
                destination = target.split('#')[0].strip('<>')
                require((path.parent / destination).exists(), f'Broken local link in {path}: {target}')
    print(f'PASS: schema + analysis semantics; {len(dictionary["issues"])} issues; '
          f'{len(manifest["samples"])} sample hash/ZIP/track checks; '
          f'{len(session_ids)} activity sessions; local links in {checked} Markdown files.')


if __name__ == '__main__':
    main()
