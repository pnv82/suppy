"""Inventory the supplied FIT samples; export selected telemetry for local UI work.

Uses Garmin's decoder. Does not calculate performance windows or diagnose technique.
Run from any directory: python scripts/inspect_samples.py
"""
from collections import Counter
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
import json
import zipfile

from garmin_fit_sdk import Decoder, Stream

ROOT = Path(__file__).resolve().parents[1]


def iso(value):
    if isinstance(value, datetime):
        return value.isoformat().replace('+00:00', 'Z')
    raise TypeError(type(value).__name__)


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, default=iso) + '\n', encoding='utf-8')


def decode(path):
    raw = path.read_bytes()
    with_stream = Stream.from_byte_array(bytearray(raw))
    try:
        decoder = Decoder(with_stream)
        if not decoder.is_fit() or not decoder.check_integrity():
            raise ValueError(f'FIT integrity failed: {path.name}')
    finally:
        with_stream.close()
    stream = Stream.from_byte_array(bytearray(raw))
    try:
        messages, errors = Decoder(stream).read()
        if errors:
            raise ValueError(f'{path.name}: {errors}')
        return messages
    finally:
        stream.close()


def main():
    result = []
    for archive in sorted((ROOT / 'data/samples/garmin/archives').glob('*.zip')):
        with zipfile.ZipFile(archive) as zipped:
            bad = zipped.testzip()
            if bad:
                raise ValueError(f'ZIP checksum failure: {bad}')
            entries = zipped.infolist()
            if len(entries) != 1 or not entries[0].filename.endswith('_ACTIVITY.fit'):
                raise ValueError(f'Expected one supplied FIT sample: {archive.name}')
            entry = entries[0]
            path = ROOT / 'data/samples/garmin/fit' / Path(entry.filename).name
            if zipped.read(entry) != path.read_bytes():
                raise ValueError(f'Extracted sample differs: {path.name}')
        session_id = path.name.split('_')[0]
        messages = decode(path)
        records = messages.get('record_mesgs', [])
        sessions = messages.get('session_mesgs', [])
        selected = ('start_time', 'timestamp', 'sport', 'sub_sport', 'total_elapsed_time',
                    'total_timer_time', 'total_distance', 'avg_speed', 'enhanced_avg_speed',
                    'max_speed', 'enhanced_max_speed', 'avg_heart_rate', 'max_heart_rate',
                    'avg_cadence', 'max_cadence', 'total_cycles', 'total_strokes', 'num_laps')
        summaries = [{k: s[k] for k in selected if k in s} for s in sessions]
        start = sessions[0].get('start_time') if len(sessions) == 1 else None
        if start is None:
            raise ValueError('Inventory expects a single session with a start time')
        rows = []
        for r in records:
            stamp = r.get('timestamp')
            rows.append({
                'timestamp_utc': stamp,
                'elapsed_s': (stamp - start).total_seconds() if stamp else None,
                'latitude_deg': r['position_lat'] * 180 / 2**31 if r.get('position_lat') is not None else None,
                'longitude_deg': r['position_long'] * 180 / 2**31 if r.get('position_long') is not None else None,
                'distance_m': r.get('distance'),
                'speed_mps': r.get('enhanced_speed', r.get('speed')),
                'heart_rate_bpm': r.get('heart_rate'),
                'cadence_raw': r.get('cadence'),
            })
        stamps = [r['timestamp'] for r in records if r.get('timestamp')]
        gaps = [(b-a).total_seconds() for a,b in zip(stamps,stamps[1:])]
        events = [{k: e[k] for k in ('timestamp','event','event_type','timer_trigger') if k in e}
                  for e in messages.get('event_mesgs', [])]
        report = {
            'session_id': session_id, 'id_source': 'supplied_filename',
            'archive': str(archive.relative_to(ROOT)).replace('\\', '/'),
            'archive_bytes': archive.stat().st_size,
            'archive_sha256': sha256(archive.read_bytes()).hexdigest(),
            'fit': str(path.relative_to(ROOT)).replace('\\', '/'),
            'fit_bytes': path.stat().st_size,
            'fit_sha256': sha256(path.read_bytes()).hexdigest(),
            'zip_crc_ok': True, 'fit_crc_ok': True,
            'message_counts': {k: len(v) for k,v in messages.items()},
            'record_field_counts': dict(Counter(str(k) for r in records for k,v in r.items() if v is not None)),
            'record_count': len(records), 'first_record_utc': stamps[0] if stamps else None,
            'last_record_utc': stamps[-1] if stamps else None,
            'max_record_gap_s': max(gaps, default=None),
            'gaps_over_10s': sum(g > 10 for g in gaps),
            'non_increasing_timestamps': sum(g <= 0 for g in gaps),
            'sessions': summaries, 'events': events,
        }
        result.append(report)
        write(ROOT / f'data/derived/{session_id}-track.json', {
            'schema_version': '0.1.0', 'session_id': session_id,
            'source_fit_sha256': report['fit_sha256'], 'start_time_utc': start,
            'cadence_semantics': 'Raw FIT cadence; paddle-stroke interpretation needs device validation.',
            'records': rows, 'events': events,
        })
    if not result:
        raise ValueError('No samples found')
    write(ROOT / 'data/derived/fit-inventory.json', {
        'generated_at': datetime.now(timezone.utc), 'decoder': 'garmin-fit-sdk==21.208.0', 'samples': result})
    for row in result:
        print(json.dumps({k: row[k] for k in ('session_id','record_count','max_record_gap_s',
                                            'gaps_over_10s','record_field_counts','sessions')}, default=iso))


if __name__ == '__main__':
    main()
