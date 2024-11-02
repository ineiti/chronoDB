# TODO

## Functionality

* Add `>%checkbox == true` and `>%checkbox == false` to only show blobs with the given attribute
* Add `>!parent` to show the parent of the same type

## Cleanup
* replace `ChronoBlob`'s `TimeLink` and `TimeData` with a getter
  * add a `DBStorage` array to `ChronoBlob`
  * each getter has an optional value `time`
    * by default the getters return the latest state
    * if `time` is set, only the `DBStorage` up to `time` are taken into account
