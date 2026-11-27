# Notices

Kritzel is released under the MIT licence (see `LICENSE`). It includes or will include the following third-party material.

## Data

- **Quick, Draw! Dataset** by Google, licensed under [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/). Source: <https://github.com/googlecreativelab/quickdraw-dataset>. A curated subset of the simplified drawings is redistributed in `packages/content/solo/drawings/` (added in milestone M3); drawings were selected and reformatted by `scripts/build-solo-dataset.mjs`.

## Fonts

Bundled with the web app from milestone M1, each under the SIL Open Font License 1.1:

- Inter
- Bricolage Grotesque
- JetBrains Mono

## Icons

- Lucide, ISC License.

## Dashboards and tooling

- **Sloth SLO dashboards** by Xabier Larrakoetxea: "SLO / Detail" (grafana.com dashboard 14348, revision 5) and "High level Sloth SLOs" (grafana.com dashboard 14643, revision 2), from the [Sloth](https://github.com/slok/sloth) project, which is licensed under the Apache License 2.0. The dashboard files carry no licence statement of their own. They are redistributed in `deploy/observability/grafana/dashboards/sloth-*.json`, changed only so that Grafana can provision them from a file: the data source input is replaced by the data source UID `prometheus` and the import metadata is removed.
- **Sloth** generates `deploy/observability/prometheus/rules/sloth-kritzel.yaml` from `deploy/observability/slo/kritzel.slo.yaml`. It is a build-time tool and is not part of the image.
