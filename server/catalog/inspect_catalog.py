# Prints what the catalog covers, source by source.
import os, sqlite3, sys
d = sqlite3.connect(os.path.join(os.environ.get('ORFEO_DATA') or sys.exit('Set ORFEO_DATA'), 'catalog.sqlite'))
q=lambda s:d.execute(s).fetchall()
print('songs/listed/parse_err',q('select count(*),sum(listed),sum(parse_error is not null) from songs'))
print('source,n,key,year,lyrics,composer');[print(' ',r) for r in q('select source,count(*),sum(key_name is not null),sum(year is not null),sum(lyrics is not null),sum(id in (select song_id from composers)) from songs group by source')]
print(q('select origin,count(distinct song_id) from genres group by origin'))
print(q('select genre,count(*) from genres group by genre order by 2 desc'))
print('era',q('select era,count(*) from songs group by era'))
print('diff',q('select difficulty,count(*) from songs group by difficulty'))
for s in ['asa-branca-1','carinhoso','accustomed','12thsong','InAMellow']:
    print(q(f"select title,credit,performer,year,key_name,scale,bpm,difficulty,(select group_concat(name,'; ') from composers where song_id=id),(select group_concat(genre||':'||origin) from genres where song_id=id) from songs where file_path like '%{s}%' limit 1"))
print('solo non-weimar',q("select title,source from songs where solo_line=1 and source!='Weimar Solos' limit 6"))
print('PB untitled',q("select count(*) from songs where source='Perfessor Bill' and id not in (select song_id from composers)"), q("select title from songs where source='Perfessor Bill' and id not in (select song_id from composers) limit 6"))
print('fts',q("select count(*) from song_search where song_search match 'sertao'"))
